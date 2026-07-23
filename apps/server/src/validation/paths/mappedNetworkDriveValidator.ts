/**
 * Ported from NzbDrone.Core/Validation/Paths/MappedNetworkDriveValidator.cs.
 * Rejects a Windows drive-letter path (e.g. `Z:\...`) that resolves to a
 * network-mounted drive, but ONLY when running as a Windows service --
 * Windows services don't inherit a logged-on user's mapped-drive session,
 * so a path that resolves fine interactively silently fails when the app
 * runs as a service. Irrelevant (always valid) on non-Windows or when not
 * running as a Windows service.
 *
 * Depends on `IRuntimeInfo.IsWindowsService` and `IDiskProvider.GetMount` --
 * neither ported elsewhere yet. `IMount`'s shape follows
 * media-files-import/mediaFileDiskProvider.ts's `MountLike` forward-ref
 * (`driveType`, same three-plus-unknown enum), same "declare the narrow
 * slice fresh, field names copied 1:1 from the real C# interface" discipline
 * that file's own doc comment documents.
 */

export interface RuntimeInfoLike {
  isWindowsService: boolean;
}

export interface MountLike {
  driveType: "network" | "fixed" | "removable" | "unknown";
}

export interface MountLookup {
  getMount(path: string): MountLike | null | undefined;
}

/**
 * Ported from `MappedNetworkDriveValidator.DriveRegex`: `[a-z]\:\\`
 * (case-insensitive, NOT anchored -- `Regex.IsMatch` matches anywhere in
 * the string, so this can match mid-string, e.g. a UNC-embedded drive
 * reference, not just a leading drive letter; preserved as-is).
 */
const DRIVE_REGEX = /[a-z]:\\/i;

/**
 * Ported from MappedNetworkDriveValidator.IsValid():
 *   1. null value -> invalid.
 *   2. Not running on Windows -> valid (no-op).
 *   3. Not running as a Windows service -> valid (no-op).
 *   4. Path doesn't match the drive-letter regex -> valid (nothing to check).
 *   5. Otherwise, invalid iff the resolved mount's DriveType is Network.
 *      A null/missing mount (`mount is not { DriveType: DriveType.Network }`
 *      -- C#'s pattern match treats a null `mount` as NOT matching `{
 *      DriveType: DriveType.Network }`, i.e. valid) is treated as valid.
 */
export function isNotMappedNetworkDriveUnderWindowsService(
  isWindows: boolean,
  runtimeInfo: RuntimeInfoLike,
  diskProvider: MountLookup,
  path: string | null | undefined
): boolean {
  if (path === null || path === undefined) {
    return false;
  }

  if (!isWindows) {
    return true;
  }

  if (!runtimeInfo.isWindowsService) {
    return true;
  }

  if (!DRIVE_REGEX.test(path)) {
    return true;
  }

  const mount = diskProvider.getMount(path);

  return mount?.driveType !== "network";
}
