import type { Author } from "../books/models.js";

/**
 * Ported from NzbDrone.Core/Notifications/AuthorDeleteMessage.cs.
 *
 * C#'s constructor computes `DeletedFilesMessage` and `Message` from
 * `Author.Name`/`DeleteFiles` at construction time -- ported as a factory
 * function (`createAuthorDeleteMessage`) rather than a class constructor
 * with side effects, matching this port's established
 * "interface + create*() factory" convention for message/DTO types (see
 * `thingi-provider/ProviderDefinition.ts`'s `createProviderDefinition`).
 * `Author.Name` (C#, a convenience property proxying `AuthorMetadata.Name`)
 * has no equivalent property on the ported `Author` interface -- callers
 * read `author.metadata?.name` directly (this repo's established access
 * pattern, see `books/models.ts`'s module doc comment) -- so the factory
 * takes the resolved display name explicitly rather than reading
 * `author.metadata?.name` itself, keeping this module free of a hard
 * dependency on `AuthorMetadata` being populated.
 */
export interface AuthorDeleteMessage {
  message: string;
  author: Author;
  deletedFiles: boolean;
  deletedFilesMessage: string;
}

/** Ported from `AuthorDeleteMessage.ToString()`. */
export function authorDeleteMessageToString(message: AuthorDeleteMessage): string {
  return message.message;
}

/**
 * Ported from the `AuthorDeleteMessage(Author author, bool deleteFiles)`
 * constructor. `authorName` is the caller-resolved `author.metadata?.name`
 * (see this file's doc comment) -- matching C#'s `Author.Name`.
 */
export function createAuthorDeleteMessage(
  author: Author,
  authorName: string,
  deleteFiles: boolean
): AuthorDeleteMessage {
  const deletedFilesMessage = deleteFiles
    ? "Author removed and all files were deleted"
    : "Author removed, files were not deleted";

  return {
    author,
    deletedFiles: deleteFiles,
    deletedFilesMessage,
    message: `${authorName} - ${deletedFilesMessage}`,
  };
}
