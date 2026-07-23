/**
 * Ported from NzbDrone.Core/Exceptions/{AuthorNotFoundException,
 * BookNotFoundException,EditionNotFoundException}.cs and
 * MetadataSource/BookInfo/BookInfoException.cs (generalized: the C# class
 * was BookInfo-specific -- "may have been removed from the metadata
 * server" -- kept here as a single provider-agnostic
 * `MetadataProviderException` since this module has three providers, not
 * one; the specific provider name is passed in at throw time instead of
 * baked into the exception's class name).
 *
 * `GoodreadsException` (Goodreads/GoodreadsException.cs) is NOT ported --
 * it existed only to wrap Goodreads-specific HTTP failures with a
 * Goodreads-flavored message; MetadataProviderException below covers the
 * same "the provider failed, here's why" role generically.
 */

export class AuthorNotFoundException extends Error {
  readonly foreignAuthorId: string;

  constructor(foreignAuthorId: string, message?: string) {
    super(
      message ??
        `Author with id ${foreignAuthorId} was not found, it may have been removed from the metadata provider.`
    );
    this.name = "AuthorNotFoundException";
    this.foreignAuthorId = foreignAuthorId;
    Object.setPrototypeOf(this, AuthorNotFoundException.prototype);
  }
}

export class BookNotFoundException extends Error {
  readonly foreignBookId: string;

  constructor(foreignBookId: string, message?: string) {
    super(
      message ??
        `Book with id ${foreignBookId} was not found, it may have been removed from the metadata provider.`
    );
    this.name = "BookNotFoundException";
    this.foreignBookId = foreignBookId;
    Object.setPrototypeOf(this, BookNotFoundException.prototype);
  }
}

export class EditionNotFoundException extends Error {
  readonly foreignEditionId: string;

  constructor(foreignEditionId: string, message?: string) {
    super(
      message ??
        `Edition with id ${foreignEditionId} was not found, it may have been removed from the metadata provider.`
    );
    this.name = "EditionNotFoundException";
    this.foreignEditionId = foreignEditionId;
    Object.setPrototypeOf(this, EditionNotFoundException.prototype);
  }
}

/**
 * Ported from BookInfoException.cs, generalized across all three providers
 * (see module doc comment). Carries the provider name so callers/logs/the
 * fallback chain (priorityMetadataService.ts) can tell which provider
 * failed without string-parsing the message.
 */
export class MetadataProviderException extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MetadataProviderException";
    this.provider = provider;
    Object.setPrototypeOf(this, MetadataProviderException.prototype);
  }
}
