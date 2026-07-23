/**
 * Ported from the exception types RootFolderService.VerifyRootFolder/Add
 * throw: plain BCL exceptions in C# (ArgumentException,
 * DirectoryNotFoundException, UnauthorizedAccessException,
 * InvalidOperationException), not custom Readarr exception classes. Ported
 * as named `Error` subclasses (see Configuration module's errors.ts for the
 * established pattern in this repo) rather than pulling in .NET's BCL
 * exception hierarchy, which has no TS equivalent worth porting.
 */

export class InvalidPathError extends Error {
  constructor(message = "Invalid path") {
    super(message);
    this.name = "InvalidPathError";
  }
}

export class DirectoryNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DirectoryNotFoundError";
  }
}

export class UnauthorizedAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnauthorizedAccessError";
  }
}

export class RootFolderAlreadyExistsError extends Error {
  constructor(message = "Root folder already exists.") {
    super(message);
    this.name = "RootFolderAlreadyExistsError";
  }
}
