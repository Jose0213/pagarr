/**
 * Ported from NzbDrone.Core/Exceptions/AuthorNotFoundException.cs.
 *
 * NOT the same class as `metadata-source/errors.ts`'s `AuthorNotFoundException`
 * -- that one is a generalized, provider-agnostic port folding in
 * MetadataSource/BookInfo/BookInfoException.cs's "may have been removed from
 * the metadata server" message (worded "metadata provider" there since that
 * module spans three providers). This is the real `NzbDrone.Core.Exceptions`
 * class as it actually exists in the C# source, with its original "metadata
 * server" wording preserved verbatim. The two are separate types in separate
 * modules, matching how the real codebase also has both
 * `NzbDrone.Core.Exceptions.AuthorNotFoundException` and (historically)
 * BookInfo-specific error paths. Do not conflate or dedupe them -- callers in
 * this module's real C# call sites (e.g. `AuthorService`, refresh services)
 * throw this one specifically.
 */
export class AuthorNotFoundException extends Error {
  readonly foreignAuthorId: string;

  constructor(foreignAuthorId: string, message?: string, options?: { cause?: unknown }) {
    super(
      message ??
        `Author with id ${foreignAuthorId} was not found, it may have been removed from the metadata server.`,
      options
    );
    this.name = "AuthorNotFoundException";
    this.foreignAuthorId = foreignAuthorId;
    Object.setPrototypeOf(this, AuthorNotFoundException.prototype);
  }
}
