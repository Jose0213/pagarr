/**
 * Ported from NzbDrone.Core/Validation/Paths/{PathExistsValidator,
 * FileExistsValidator,FolderWritableValidator}.cs. All three defer to
 * `IDiskProvider` methods this port already has multiple independent
 * (structurally identical) implementations of --
 * root-folders/disk-provider.ts, media-files-organize/diskProvider.ts,
 * media-files-import/mediaFileDiskProvider.ts, decision-engine's
 * `deletedBookFileSpecification.ts` -- so these validators are typed
 * against a narrow local structural shape (`Pick`-equivalent) rather than
 * importing any one of those concrete modules, avoiding an arbitrary
 * cross-module coupling. `folderWritable` is typed to allow either a sync
 * boolean or `Promise<boolean>` since existing implementations differ
 * (root-folders/disk-provider.ts's is async; a validator caller awaits it
 * regardless).
 */

export interface FolderExistsCheck {
  folderExists(path: string): boolean;
}

export interface FileExistsCheck {
  fileExists(path: string): boolean;
}

export interface FolderWritableCheck {
  folderWritable(path: string): boolean | Promise<boolean>;
}

/** Ported from PathExistsValidator.IsValid(): null fails; otherwise defers to `diskProvider.FolderExists`. */
export function pathExists(
  diskProvider: FolderExistsCheck,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return false;
  }
  return diskProvider.folderExists(path);
}

/** Ported from FileExistsValidator.IsValid(): null fails; otherwise defers to `diskProvider.FileExists`. */
export function fileExists(
  diskProvider: FileExistsCheck,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return false;
  }
  return diskProvider.fileExists(path);
}

/**
 * Ported from FolderWritableValidator.IsValid(): null fails; otherwise
 * defers to `diskProvider.FolderWritable`. The C# message also interpolates
 * `Environment.UserName` (the OS user Pagarr is running as) -- exposed here
 * as a companion helper since message formatting isn't otherwise part of
 * these pure predicate functions (see this module's report for how
 * messages are assembled by callers).
 */
export async function folderWritable(
  diskProvider: FolderWritableCheck,
  path: string | null | undefined
): Promise<boolean> {
  if (path === null || path === undefined) {
    return false;
  }
  return diskProvider.folderWritable(path);
}

/** Ported from `Environment.UserName` as used in FolderWritableValidator's message template. */
export function currentUserName(): string {
  return process.env["USERNAME"] ?? process.env["USER"] ?? "";
}
