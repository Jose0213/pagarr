import type { IDiskProvider } from "./disk-provider.js";
import type { RootFolder } from "./root-folder.js";
import type { IRootFolderRepository } from "./root-folder-repository.js";
import { getCleanPath, isParentPath, isPathRooted, pathEquals } from "./path-utils.js";
import {
  DirectoryNotFoundError,
  InvalidPathError,
  RootFolderAlreadyExistsError,
  UnauthorizedAccessError,
} from "./errors.js";

/**
 * Ported from NzbDrone.Core/RootFolders/RootFolderService.cs.
 *
 * Constructor-injection deviation (per PORT_PLAN.md -- "plain constructor
 * injection / factory functions passed explicitly", no DI container): the
 * C# constructor also takes `IManageCommandQueue commandQueueManager` and an
 * NLog `Logger`, from modules not ported yet (`Jobs`/`Messaging` -- Phase 4,
 * and `Instrumentation` -- Phase 4). Rather than block this module on those:
 *   - `commandQueueManager.Push(new RescanFoldersCommand(...))` calls (fired
 *     from Add(), a "rescan this new root folder's contents" side effect)
 *     become an optional `onRootFolderAdded` callback, same shape as
 *     ConfigService's `onConfigSaved` stand-in for its un-ported event bus.
 *     When Jobs/Messaging land, wire a real command-queue push in here.
 *   - NLog `Logger.Error(...)` calls in `AllWithSpaceStats()`'s catch
 *     become an optional `onError` callback (defaults to a no-op), so the
 *     "never let a single bad root folder blow up the whole list" behavior
 *     is preserved without inventing a full logging dependency.
 *
 * `Handle(ModelEvent<RemotePathMapping>)` (auto-rescans calibre libraries
 * mounted through a changed remote path mapping) is NOT ported here:
 * RemotePathMappings is its own not-yet-ported Phase 3 module, and
 * Messaging's `IHandle<T>` event-subscription mechanism this method plugs
 * into doesn't exist yet either. Porting a single orphaned handler method
 * with nothing to subscribe it to would just be dead code; add it back when
 * both of those modules land.
 */

export interface RootFolderServiceOptions {
  /** Stand-in for `_commandQueueManager.Push(new RescanFoldersCommand(...))` in Add(). See module doc comment. */
  onRootFolderAdded?: (path: string) => void;
  /** Stand-in for `_logger.Error(...)` in AllWithSpaceStats()'s per-folder catch. See module doc comment. */
  onError?: (path: string, error: unknown) => void;
}

export interface IRootFolderService {
  all(): RootFolder[];
  allWithSpaceStats(): Promise<RootFolder[]>;
  add(rootFolder: RootFolder): Promise<RootFolder>;
  update(rootFolder: RootFolder): Promise<RootFolder>;
  remove(id: number): void;
  get(id: number): Promise<RootFolder>;
  allForTag(tagId: number): RootFolder[];
  getBestRootFolder(path: string, allRootFolders?: RootFolder[]): RootFolder | undefined;
  getBestRootFolderPath(path: string, allRootFolders?: RootFolder[]): string;
}

export class RootFolderService implements IRootFolderService {
  private readonly onRootFolderAdded?: (path: string) => void;
  private readonly onError?: (path: string, error: unknown) => void;

  constructor(
    private readonly rootFolderRepository: IRootFolderRepository,
    private readonly diskProvider: IDiskProvider,
    options: RootFolderServiceOptions = {},
  ) {
    this.onRootFolderAdded = options.onRootFolderAdded;
    this.onError = options.onError;
  }

  all(): RootFolder[] {
    return this.rootFolderRepository.all();
  }

  /**
   * Ported from RootFolderService.AllWithSpaceStats(). C#'s `Task.Run(...).Wait(5000)`
   * per-folder free-space probe (see getDetails) is inherently async here
   * rather than a blocking wait-with-timeout, so this method is async where
   * the C# signature is synchronous -- see getDetails()'s own doc comment.
   */
  async allWithSpaceStats(): Promise<RootFolder[]> {
    const rootFolders = this.rootFolderRepository.all();

    for (const folder of rootFolders) {
      try {
        if (isPathRooted(folder.path)) {
          await this.getDetails(folder);
        }
      } catch (e) {
        // We don't want an exception to prevent the root folders from loading in the UI, so they can still be deleted
        this.onError?.(folder.path, e);
      }
    }

    return rootFolders;
  }

  private async verifyRootFolder(rootFolder: RootFolder): Promise<void> {
    if (!rootFolder.path || !rootFolder.path.trim() || !isPathRooted(rootFolder.path)) {
      throw new InvalidPathError("Invalid path");
    }

    if (!this.diskProvider.folderExists(rootFolder.path)) {
      throw new DirectoryNotFoundError("Can't add root directory that doesn't exist.");
    }

    if (!(await this.diskProvider.folderWritable(rootFolder.path))) {
      throw new UnauthorizedAccessError(
        `Root folder path '${rootFolder.path}' is not writable by user '${process.env["USERNAME"] ?? process.env["USER"] ?? ""}'`,
      );
    }
  }

  async add(rootFolder: RootFolder): Promise<RootFolder> {
    await this.verifyRootFolder(rootFolder);

    if (this.all().some((r) => pathEquals(r.path, rootFolder.path))) {
      throw new RootFolderAlreadyExistsError();
    }

    const inserted = this.rootFolderRepository.insert(rootFolder);

    this.onRootFolderAdded?.(inserted.path);

    await this.getDetails(inserted);

    return inserted;
  }

  async update(rootFolder: RootFolder): Promise<RootFolder> {
    await this.verifyRootFolder(rootFolder);

    const updated = this.rootFolderRepository.update(rootFolder);

    await this.getDetails(updated);

    return updated;
  }

  remove(id: number): void {
    this.rootFolderRepository.delete(id);
  }

  async get(id: number): Promise<RootFolder> {
    const rootFolder = this.rootFolderRepository.get(id);
    await this.getDetails(rootFolder);

    return rootFolder;
  }

  allForTag(tagId: number): RootFolder[] {
    return this.all().filter((r) => r.defaultTags.has(tagId));
  }

  getBestRootFolder(path: string, allRootFolders?: RootFolder[]): RootFolder | undefined {
    const folders = allRootFolders ?? this.all();

    return folders
      .filter((r) => pathEquals(r.path, path) || isParentPath(r.path, path))
      .reduce<RootFolder | undefined>((best, candidate) => {
        if (!best || candidate.path.length > best.path.length) {
          return candidate;
        }
        return best;
      }, undefined);
  }

  getBestRootFolderPath(path: string, allRootFolders?: RootFolder[]): string {
    const possibleRootFolder = this.getBestRootFolder(path, allRootFolders);

    if (!possibleRootFolder) {
      // Ported from RootFolderService.GetBestRootFolderPath's fallback: OsPath(path).Directory,
      // trimmed of its trailing separator. See path-utils.ts's isPathRooted doc comment for why
      // this module doesn't carry over the full OsPath dual-flavor abstraction -- here the
      // directory-of-path computation only needs to strip the last path segment, which
      // node:path's dirname-style trim (done inline below) matches for both path flavors.
      return getDirectory(path);
    }

    return possibleRootFolder.path;
  }

  /**
   * Ported from RootFolderService.GetDetails(): `Task.Run(() => {...}).Wait(5000)`
   * -- fire the disk probe with a 5-second timeout, silently leaving
   * Accessible/FreeSpace/TotalSpace at their defaults if it doesn't finish
   * in time (Wait() returning false is not checked/thrown on, so a timeout
   * is not an error, just a no-op). Ported as a real async operation raced
   * against a timer, since `diskProvider.folderExists/getAvailableSpace/
   * getTotalSize` are synchronous fs calls here (see disk-provider.ts) --
   * there's no actual concurrency hazard to await, but the 5s abandon-if-slow
   * behavior is preserved for parity with slow/hung network-mount cases.
   */
  private async getDetails(rootFolder: RootFolder): Promise<void> {
    const probe = async (): Promise<void> => {
      if (this.diskProvider.folderExists(rootFolder.path)) {
        rootFolder.accessible = true;
        rootFolder.freeSpace = this.diskProvider.getAvailableSpace(rootFolder.path);
        rootFolder.totalSpace = this.diskProvider.getTotalSize(rootFolder.path);
      }
    };

    await Promise.race([
      probe(),
      new Promise<void>((resolve) => setTimeout(resolve, 5000)),
    ]);
  }
}

function getDirectory(path: string): string {
  const isUnc = path.startsWith("\\\\");
  const separators = /[/\\]/;
  const trimmed = path.replace(/[/\\]+$/, "");
  const lastSepIndex = [...trimmed].reduce<number>(
    (idx, ch, i) => (separators.test(ch) ? i : idx),
    -1,
  );

  if (lastSepIndex === -1) {
    return getCleanPath(trimmed);
  }

  // Preserve a root separator ("/" or the UNC "\\server") rather than
  // trimming it away entirely.
  const directory = trimmed.slice(0, lastSepIndex) || (isUnc ? "\\\\" : trimmed[0]);
  return getCleanPath(directory ?? "");
}
