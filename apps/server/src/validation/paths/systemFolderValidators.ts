/**
 * Ported from NzbDrone.Core/Validation/Paths/{RecycleBinValidator,
 * StartupFolderValidator,SystemFolderValidator}.cs plus the
 * NzbDrone.Common/Disk/SystemFolders.cs helper SystemFolderValidator uses.
 *
 * All three share the same two-stage check against a "protected" folder:
 * exact path-equality ("is set to") vs. ancestor-of ("is child of"), each
 * with its own relationship word baked into the message, matching the C#
 * source's shared `context.MessageFormatter.AppendArgument("relationship",
 * ...)` pattern.
 */
import { isParentPath, pathEquals } from "../../root-folders/path-utils.js";

/**
 * Ported from RecycleBinValidator.IsValid(): null value or empty/blank
 * configured recycle bin path short-circuits to valid (nothing configured
 * to conflict with). Otherwise invalid if the candidate path equals or is a
 * child of the configured recycle bin folder.
 */
export interface RecycleBinValidationResult {
  isValid: boolean;
  /** "set to" | "child of" -- only meaningful when isValid is false, matching the C# message's `{relationship}` token. */
  relationship?: "set to" | "child of";
}

export function validateAgainstRecycleBin(
  recycleBin: string | null | undefined,
  path: string | null | undefined
): RecycleBinValidationResult {
  if (path === null || path === undefined || !recycleBin || recycleBin.trim() === "") {
    return { isValid: true };
  }

  if (pathEquals(recycleBin, path)) {
    return { isValid: false, relationship: "set to" };
  }

  if (isParentPath(recycleBin, path)) {
    return { isValid: false, relationship: "child of" };
  }

  return { isValid: true };
}

/**
 * Minimal shape StartupFolderValidator needs from `IAppFolderInfo`
 * (NzbDrone.Common/EnvironmentInfo -- not otherwise ported yet; no module
 * in this codebase has needed the full `IAppFolderInfo` surface before
 * this one, see instrumentation/deleteLogFilesService.ts's doc comment for
 * the same "not ported yet, narrow local shape" situation with
 * `GetLogFolder`/`GetUpdateLogFolder`).
 */
export interface IAppFolderInfoLike {
  startUpFolder: string;
}

/**
 * Ported from StartupFolderValidator.IsValid(): null is valid; otherwise
 * invalid if the candidate path equals or is a child of the app's startup
 * folder.
 */
export function validateAgainstStartupFolder(
  appFolderInfo: IAppFolderInfoLike,
  path: string | null | undefined
): RecycleBinValidationResult {
  if (path === null || path === undefined) {
    return { isValid: true };
  }

  const startupFolder = appFolderInfo.startUpFolder;

  if (pathEquals(startupFolder, path)) {
    return { isValid: false, relationship: "set to" };
  }

  if (isParentPath(startupFolder, path)) {
    return { isValid: false, relationship: "child of" };
  }

  return { isValid: true };
}

/**
 * Ported from NzbDrone.Common/Disk/SystemFolders.cs GetSystemFolders():
 * Windows -> `Environment.GetFolderPath(Environment.SpecialFolder.Windows)`
 * (the `%SystemRoot%` / `C:\Windows` directory); macOS -> `/System`;
 * everything else (Linux) -> `/bin`, `/boot`, `/lib`, `/sbin`, `/proc`,
 * `/usr/bin`.
 *
 * DEVIATION: `Environment.GetFolderPath(SpecialFolder.Windows)` has no
 * built-in Node equivalent -- this reads `process.env.SystemRoot` (the same
 * environment variable .NET's implementation ultimately resolves from on
 * Windows), falling back to the practically-universal `C:\Windows` default
 * .NET itself falls back to when the variable is unset.
 */
export function getSystemFolders(): string[] {
  if (process.platform === "win32") {
    return [process.env["SystemRoot"] ?? "C:\\Windows"];
  }

  if (process.platform === "darwin") {
    return ["/System"];
  }

  return ["/bin", "/boot", "/lib", "/sbin", "/proc", "/usr/bin"];
}

export interface SystemFolderValidationResult {
  isValid: boolean;
  relationship?: "set to" | "child of";
  systemFolder?: string;
}

/**
 * Ported from SystemFolderValidator.IsValid(): iterates
 * `SystemFolders.GetSystemFolders()` in order, returning invalid on the
 * FIRST system folder the candidate path equals or is a child of (C#'s
 * `foreach` with an early `return false`) -- unlike RecycleBinValidator/
 * StartupFolderValidator, this one does NOT treat a null path as valid; C#
 * calls `context.PropertyValue.ToString()` unconditionally with no null
 * guard, which would NullReferenceException on a genuinely null value in
 * the real FluentValidation pipeline (a real, if unlikely-to-trigger, C#
 * quirk -- FluentValidation's default `NotNull`-less property validators
 * assume a non-null value has already been established elsewhere in the
 * rule chain). Preserved by requiring a non-null string here (TypeScript's
 * type system enforces what C# only enforced by convention).
 */
export function validateAgainstSystemFolders(path: string): SystemFolderValidationResult {
  for (const systemFolder of getSystemFolders()) {
    if (pathEquals(systemFolder, path)) {
      return { isValid: false, relationship: "set to", systemFolder };
    }

    if (isParentPath(systemFolder, path)) {
      return { isValid: false, relationship: "child of", systemFolder };
    }
  }

  return { isValid: true };
}
