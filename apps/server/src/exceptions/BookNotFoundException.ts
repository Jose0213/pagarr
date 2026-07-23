/**
 * Ported from NzbDrone.Core/Exceptions/BookNotFoundException.cs.
 *
 * NOT the same class as `metadata-source/errors.ts`'s `BookNotFoundException`
 * -- see AuthorNotFoundException.ts's doc comment for why both exist. This is
 * the real `NzbDrone.Core.Exceptions` class, "metadata server" wording
 * preserved verbatim from the C# source.
 */
export class BookNotFoundException extends Error {
  readonly foreignBookId: string;

  constructor(foreignBookId: string, message?: string, options?: { cause?: unknown }) {
    super(
      message ??
        `Book with id ${foreignBookId} was not found, it may have been removed from metadata server.`,
      options
    );
    this.name = "BookNotFoundException";
    this.foreignBookId = foreignBookId;
    Object.setPrototypeOf(this, BookNotFoundException.prototype);
  }
}
