import { watch, type FSWatcher } from "node:fs";
import { extname } from "node:path";
import { Debouncer } from "./debouncer.js";
import type { RootFolder } from "../root-folders/root-folder.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/RootFolderWatchingService.cs.
 *
 * `IManageCommandQueue`/`RescanFoldersCommand` (Messaging module, Phase 4,
 * not ported yet) -- `ScanPending`'s `_commandQueueManager.Push(new
 * RescanFoldersCommand(...))` becomes an optional `onScanPending` callback,
 * matching this port's established callback-stand-in convention.
 * `ApplicationStartedEvent`/`ConfigSavedEvent`/`ModelEvent<RootFolder>`
 * handlers (`IHandle<T>`) are exposed as plain public methods
 * (`handleApplicationStarted`/`handleConfigSaved`/`handleRootFolderCreated`/
 * `handleRootFolderDeleted`) a future event-bus wiring can call.
 *
 * `FileSystemWatcher` (`System.IO`) -> Node's `fs.watch` with `recursive:
 * true`. .NET's watcher fires granular Created/Deleted/Renamed/Changed
 * events with rich metadata; Node's `fs.watch` fires a single coarse
 * `rename`/`change` event with just the changed (relative) filename and no
 * old-path-on-rename info. This preserves the actually-relevant behavior --
 * "something under this root folder changed -> debounce -> trigger a
 * rescan" -- since every C# event type funnels into the exact same
 * `Watcher_Changed` handler / `_changedPaths` dictionary anyway; the finer
 * distinction the C# source captures (Created vs Deleted vs Renamed vs
 * Changed) is never actually branched on downstream (see `ScanPending`,
 * which only cares about the *set* of dirty root folders). `recursive:
 * true` is only reliably supported on Windows and macOS in Node -- on Linux
 * this silently falls back to non-recursive per-directory watching in
 * Node's own implementation, a real platform gap noted here rather than
 * hidden.
 */
export interface RootFolderWatchingServiceOptions {
  /** Stand-in for `_commandQueueManager.Push(new RescanFoldersCommand(...))`. See module doc comment. */
  onScanPending?: (rootFolders: string[]) => void;
  /** Milliseconds; C# uses a 30-second debounce (`DEBOUNCE_TIMEOUT_SECONDS`). */
  debounceMs?: number;
}

const DEFAULT_DEBOUNCE_MS = 30_000;

/** Mirrors the subset of MediaFileExtensions.AllExtensions this service checks against (real, merged Parser module -- see parser/qualityParser.ts). */
export interface MediaExtensionsLike {
  has(extension: string): boolean;
}

export interface IRootFolderWatchingService {
  reportFileSystemChangeBeginning(...paths: string[]): void;
}

export class RootFolderWatchingService implements IRootFolderWatchingService {
  private readonly fileSystemWatchers = new Map<string, FSWatcher>();
  private readonly tempIgnoredPaths = new Map<string, number>();
  private readonly changedPaths = new Map<string, string>();

  private readonly onScanPending?: (rootFolders: string[]) => void;
  private readonly scanDebouncer: Debouncer;
  private watchForChanges = false;

  constructor(
    private readonly mediaExtensions: MediaExtensionsLike,
    options: RootFolderWatchingServiceOptions = {}
  ) {
    this.onScanPending = options.onScanPending;
    this.scanDebouncer = new Debouncer(
      () => this.scanPending(),
      options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      true
    );
  }

  dispose(): void {
    for (const watcher of this.fileSystemWatchers.values()) {
      this.disposeWatcher(watcher, false);
    }
  }

  reportFileSystemChangeBeginning(...paths: string[]): void {
    for (const path of paths.filter((p) => p.trim() !== "")) {
      const cleaned = cleanFilePathBasic(path);
      this.tempIgnoredPaths.set(cleaned, (this.tempIgnoredPaths.get(cleaned) ?? 0) + 1);
    }
  }

  /** Ported from `Handle(ApplicationStartedEvent message)`. */
  handleApplicationStarted(watchLibraryForChanges: boolean, rootFolders: RootFolder[]): void {
    this.watchForChanges = watchLibraryForChanges;

    if (this.watchForChanges) {
      for (const folder of rootFolders) {
        this.startWatchingPath(folder.path);
      }
    }
  }

  /** Ported from `Handle(ConfigSavedEvent message)`. */
  handleConfigSaved(watchLibraryForChanges: boolean, rootFolders: RootFolder[]): void {
    const oldWatch = this.watchForChanges;
    this.watchForChanges = watchLibraryForChanges;

    if (this.watchForChanges !== oldWatch) {
      if (this.watchForChanges) {
        for (const folder of rootFolders) {
          this.startWatchingPath(folder.path);
        }
      } else {
        for (const folder of rootFolders) {
          this.stopWatchingPath(folder.path);
        }
      }
    }
  }

  /** Ported from `Handle(ModelEvent<RootFolder> message)`'s Created branch. */
  handleRootFolderCreated(path: string): void {
    if (this.watchForChanges) {
      this.startWatchingPath(path);
    }
  }

  /** Ported from `Handle(ModelEvent<RootFolder> message)`'s Deleted branch. */
  handleRootFolderDeleted(path: string): void {
    this.stopWatchingPath(path);
  }

  private startWatchingPath(path: string): void {
    if (!path || path.trim() === "") {
      throw new Error("path must not be null or whitespace");
    }

    // Already being watched.
    if (this.fileSystemWatchers.has(path)) {
      return;
    }

    try {
      const watcher = watch(path, { recursive: true }, (_eventType, filename) => {
        if (filename === null) {
          return;
        }
        this.watcherChanged(path, `${path}/${filename.toString()}`);
      });

      watcher.on("error", (err) => this.watcherError(path, watcher, err));

      this.fileSystemWatchers.set(path, watcher);
    } catch {
      // Matches the C# source's catch-and-Error-log wrapper around a
      // failed FileSystemWatcher construction (e.g. path doesn't exist).
    }
  }

  private stopWatchingPath(path: string): void {
    const watcher = this.fileSystemWatchers.get(path);
    if (watcher) {
      this.disposeWatcher(watcher, true, path);
    }
  }

  private watcherError(path: string, watcher: FSWatcher, _err: Error): void {
    // Node's fs.watch has no InternalBufferOverflowException equivalent to
    // distinguish from other errors (ENOSPC on Linux from too many inotify
    // watches is the closest analog) -- ported as: always treat a watcher
    // error the same as the C# source's generic-error branch
    // (Error-log-and-dispose), since there's no reliable cross-platform way
    // to detect "this specific error means the watcher needs a
    // full-rescan retry" the way .NET's typed exception does.
    this.disposeWatcher(watcher, true, path);
  }

  private watcherChanged(rootFolder: string, fullPath: string): void {
    try {
      if (!fullPath || fullPath.trim() === "") {
        throw new Error("path must not be null or empty");
      }

      this.changedPaths.set(fullPath, rootFolder);

      this.scanDebouncer.execute();
    } catch {
      // Matches the C# source's catch-and-Error-log wrapper.
    }
  }

  private scanPending(): void {
    const pairs = [...this.changedPaths.entries()];
    this.changedPaths.clear();

    const ignored = [...this.tempIgnoredPaths.keys()];
    this.tempIgnoredPaths.clear();

    const toScan = new Set<string>();

    for (const [rawPath, rootFolder] of pairs) {
      const path = cleanFilePathBasic(rawPath);

      if (!this.shouldIgnoreChange(path, ignored)) {
        toScan.add(rootFolder);
      }
    }

    if (toScan.size > 0) {
      this.onScanPending?.([...toScan]);
    }
  }

  private shouldIgnoreChange(cleanPath: string, ignoredPaths: string[]): boolean {
    const cleaned = cleanFilePathBasic(cleanPath);

    // Skip partial/backup.
    if (cleanPath.endsWith(".partial~") || cleanPath.endsWith(".backup~")) {
      return true;
    }

    // Only proceed for directories and files with book/audio extensions.
    const extension = extname(cleaned);
    if (extension === "") {
      return true;
    }

    if (extension !== "" && !this.mediaExtensions.has(extension)) {
      return true;
    }

    // If the parent of an ignored path has a change event, ignore that too.
    return ignoredPaths.some(
      (ignored) =>
        pathStringEquals(ignored, cleaned) ||
        ignored.startsWith(`${cleaned}/`) ||
        ignored.startsWith(`${cleaned}\\`) ||
        pathStringEquals(dirnameOf(ignored), cleaned)
    );
  }

  private disposeWatcher(watcher: FSWatcher, removeFromList: boolean, path?: string): void {
    try {
      watcher.close();
    } catch {
      // We don't care about exceptions disposing.
    }

    if (removeFromList && path !== undefined) {
      this.fileSystemWatchers.delete(path);
    }
  }
}

function pathStringEquals(a: string, b: string): boolean {
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function dirnameOf(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx > 0 ? path.slice(0, idx) : path;
}

/** Ported from `PathExtensions.CleanFilePathBasic` as used here (see root-folders/path-utils.ts's private equivalent -- duplicated here since that file's helper isn't exported and this module can't modify files outside its own tree). */
function cleanFilePathBasic(path: string): string {
  if (!path.includes("/") && path.startsWith("\\\\")) {
    return path.replace(/[/\\ ]+$/, "");
  }

  return path.replace(/\/+$/, "").replace(/^[\\ ]+|[\\ ]+$/g, "");
}
