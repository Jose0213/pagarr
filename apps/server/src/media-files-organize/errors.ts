/**
 * Ported exception types from across the real C# sources this module
 * depends on:
 *   - `FileAlreadyExistsException`/`DestinationAlreadyExistsException` --
 *     NzbDrone.Common/Disk/*.cs (the `IDiskTransferService` layer).
 *   - `SameFilenameException` -- NzbDrone.Core/MediaFiles/
 *     SameFilenameException.cs.
 *   - `RootFolderNotFoundException`/`RecycleBinException` --
 *     NzbDrone.Core/MediaFiles/BookImport/*.cs (both extend
 *     `DirectoryNotFoundException` in C#; ported here as plain `Error`
 *     subclasses per this repo's established convention -- see
 *     root-folders/errors.ts's header comment on why .NET's BCL exception
 *     hierarchy isn't ported).
 */

export class FileAlreadyExistsException extends Error {
  readonly filename: string;

  constructor(message: string, filename: string) {
    super(message);
    this.name = "FileAlreadyExistsException";
    this.filename = filename;
  }
}

export class DestinationAlreadyExistsException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DestinationAlreadyExistsException";
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

export class RootFolderNotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RootFolderNotFoundException";
  }
}

export class RecycleBinException extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RecycleBinException";
  }
}
