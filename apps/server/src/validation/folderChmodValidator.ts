/**
 * Ported from NzbDrone.Core/Validation/FolderChmodValidator.cs, which
 * defers to `IDiskProvider.IsValidFolderPermissionMask(mask)`. The base
 * `DiskProviderBase.IsValidFolderPermissionMask` throws
 * `NotSupportedException` (Windows has no chmod concept); the real logic
 * lives in the Mono/POSIX implementation,
 * NzbDrone.Mono/Disk/DiskProvider.cs's override:
 *
 *   var permissions = NativeConvert.FromOctalPermissionString(mask);
 *   if ((permissions & ~FilePermissions.ACCESSPERMS) != 0) return false; // only access-permission bits allowed
 *   if ((permissions & FilePermissions.S_IRWXU) != FilePermissions.S_IRWXU) return false; // owner rwx required
 *   return true;
 *   // catch FormatException -> false
 *
 * `NativeConvert.FromOctalPermissionString` (Mono.Posix) parses a string of
 * octal digits into a `FilePermissions` bitmask the same way `chmod`'s
 * numeric mode argument works: up to 4 octal digits, where a 4th (leftmost)
 * digit encodes the special bits (setuid/setgid/sticky) and the low 3
 * digits encode owner/group/other rwx. `ACCESSPERMS` = 0777 (rwxrwxrwx, no
 * special bits); `S_IRWXU` = 0700 (owner read+write+execute).
 *
 * Ported directly against the same real Mono unit-test cases
 * (NzbDrone.Mono.Test/DiskProviderTests/DiskProviderFixture.cs,
 * IsValidFolderPermissionMask_should_return_correct): "1755"/"2755"/"4755"/
 * "7755" (any special bit set) all fail; "000".."600"/"0000".."0600" (owner
 * missing r, w, or x) all fail; "700"/"0700" pass.
 */

/**
 * Parses a chmod-style octal permission-mask string into a numeric mode,
 * matching `NativeConvert.FromOctalPermissionString`'s accepted shape: 1-4
 * octal digits (each digit 0-7). Returns null on anything else (empty,
 * non-octal-digit characters, more than 4 digits), matching
 * `FormatException` being caught as "invalid" in the C# source.
 */
function parseOctalPermissionString(mask: string): number | null {
  if (!/^[0-7]{1,4}$/.test(mask)) {
    return null;
  }
  return parseInt(mask, 8);
}

const ACCESS_PERMS = 0o777; // rwxrwxrwx, no special bits
const S_IRWXU = 0o700; // owner rwx

/** Ported from FolderChmodValidator.IsValid() + DiskProvider.IsValidFolderPermissionMask(). */
export function isValidFolderPermissionMask(mask: string | null | undefined): boolean {
  if (mask === null || mask === undefined) {
    return false;
  }

  const permissions = parseOctalPermissionString(mask);
  if (permissions === null) {
    return false;
  }

  if ((permissions & ~ACCESS_PERMS) !== 0) {
    // Only allow access permissions (reject any special bit: setuid/setgid/sticky).
    return false;
  }

  if ((permissions & S_IRWXU) !== S_IRWXU) {
    // We expect at least full owner permissions (700).
    return false;
  }

  return true;
}
