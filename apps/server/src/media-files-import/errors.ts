/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/RootFolderNotFoundException.cs
 * and RecycleBinException.cs, plus NzbDrone.Core/MediaFiles/
 * SameFilenameException.cs. All three are real C# exception types this
 * module's own source declares (RootFolderNotFoundException/
 * RecycleBinException in BookImport/, SameFilenameException one level up
 * in MediaFiles/) -- ported as real `Error` subclasses so `instanceof`
 * works the same way `catch (RootFolderNotFoundException)` etc. does in
 * C# (see decision-engine/remoteBook.ts's `ModelNotFoundException` for the
 * established pattern of porting a C# exception type this way).
 *
 * `DestinationAlreadyExistsException` (NzbDrone.Common/Disk/) is a
 * forward-reference: it's a Common/Disk-layer type this module's own
 * `ImportApprovedBooks.Import()` catches explicitly (see that file's
 * `catch (DestinationAlreadyExistsException e)` clause), but its owning
 * module (`NzbDrone.Common.Disk`, the disk-provider layer) isn't ported in
 * this worktree -- the disk-provider surface this module needs is its own
 * narrow forward-reference (see mediaFileDiskProvider.ts). Declared here as
 * a real Error subclass, copied 1:1 in shape, so the eventual real
 * disk-provider port can throw the same class and this module's catch
 * clause keeps working unchanged.
 */

export class RootFolderNotFoundException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "RootFolderNotFoundException";
  }
}

export class RecycleBinException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "RecycleBinException";
  }
}

export class SameFilenameException extends Error {
  readonly filename: string;

  constructor(message: string, filename: string) {
    super(message);
    this.name = "SameFilenameException";
    this.filename = filename;
  }
}

/** Forward-reference for NzbDrone.Common/Disk/DestinationAlreadyExistsException.cs -- see module doc comment. */
export class DestinationAlreadyExistsException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "DestinationAlreadyExistsException";
  }
}

/**
 * Forward-reference for NzbDrone.Common/Exceptions/UnauthorizedAccessException-shaped
 * catch target: `ImportApprovedBooks.Import()` catches .NET's built-in
 * `System.UnauthorizedAccessException` (a permissions error surfaced by
 * disk-provider file operations). Node has no built-in equivalent class to
 * `instanceof`-check against, so this is a real Error subclass a future
 * disk-provider port should throw for permission failures.
 */
export class UnauthorizedAccessException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "UnauthorizedAccessException";
  }
}

/**
 * Forward-reference for NzbDrone.Core/Books/Calibre/CalibreException.cs
 * (Books.Calibre module, not ported -- Calibre integration is out of
 * scope). `ImportApprovedBooks.Import()` catches this specific type; kept
 * as a real Error subclass for the same `instanceof` fidelity reason as
 * the others above.
 */
export class CalibreException extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "CalibreException";
  }
}
