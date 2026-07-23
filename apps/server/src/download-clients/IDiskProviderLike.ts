/**
 * Forward-ref for the slice of NzbDrone.Common/Disk/IDiskProvider.cs this
 * module's in-scope files actually call: `DownloadClientBase.DeleteItemData`/
 * `TestFolder` need folder/file existence + writability + delete;
 * Blackhole's `TorrentBlackhole`/`UsenetBlackhole` need `OpenWriteStream` to
 * write the saved .torrent/.magnet/.nzb file; `ScanWatchFolder` (Blackhole's
 * watch-folder scanner) needs directory/file enumeration, size, lock-state,
 * and timestamp lookups.
 *
 * `root-folders/disk-provider.ts` already ports a *different* narrow slice
 * (`folderExists`/`folderWritable`/`getAvailableSpace`/`getTotalSize`, the
 * slice RootFolderService needs, per that file's own header comment) --
 * this module needs a materially different slice (delete operations, file
 * writing, directory scanning) that file doesn't cover, so this is a
 * separate narrowing rather than an extension of that one, matching the
 * precedent `decision-engine/specifications/rssSync/deletedBookFileSpecification.ts`'s
 * `DiskProviderLike` already set (a third, still-different narrow slice of
 * the same C# interface). A future full `Common/Disk` module port should
 * unify all of these behind one real `IDiskProvider` implementation; each
 * narrowed interface's shape was kept faithful to the real C# method names
 * (camelCased) so that unification is mechanical.
 */
export interface IDiskProviderLike {
  folderExists(path: string): boolean | Promise<boolean>;
  fileExists(path: string): boolean | Promise<boolean>;
  folderWritable(path: string): boolean | Promise<boolean>;
  deleteFolder(path: string, recursive: boolean): void | Promise<void>;
  deleteFile(path: string): void | Promise<void>;

  /** Ported from `IDiskProvider.OpenWriteStream(string path)`. Returns a Node writable stream. */
  openWriteStream(path: string): NodeJS.WritableStream | Promise<NodeJS.WritableStream>;

  /** Ported from `IDiskProvider.GetDirectories(string path)`. */
  getDirectories(path: string): string[] | Promise<string[]>;
  /** Ported from `IDiskProvider.GetFiles(string path, bool recursive)`. */
  getFiles(path: string, recursive: boolean): string[] | Promise<string[]>;
  /** Ported from `IDiskProvider.GetFileSize(string path)`. */
  getFileSize(path: string): number | Promise<number>;
  /** Ported from `IDiskProvider.IsFileLocked(string path)`. */
  isFileLocked(path: string): boolean | Promise<boolean>;
  /** Ported from `IDiskProvider.FolderGetCreationTime(string path)`. Returns .NET `DateTime.Ticks` equivalent: milliseconds since epoch. */
  folderGetCreationTime(path: string): number | Promise<number>;
  /** Ported from `IDiskProvider.FolderGetLastWrite(string path)`. Milliseconds since epoch. */
  folderGetLastWrite(path: string): number | Promise<number>;
  /** Ported from `IDiskProvider.FileGetLastWrite(string path)`. Milliseconds since epoch. */
  fileGetLastWrite(path: string): number | Promise<number>;
}
