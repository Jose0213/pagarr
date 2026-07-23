import type { Book } from "../books/models.js";

/**
 * Ported from NzbDrone.Core/Notifications/BookDeleteMessage.cs. Same
 * "factory function instead of constructor side effect" approach as
 * `AuthorDeleteMessage.ts` -- see that file's doc comment.
 */
export interface BookDeleteMessage {
  message: string;
  book: Book;
  deletedFiles: boolean;
  deletedFilesMessage: string;
}

/** Ported from `BookDeleteMessage.ToString()`. */
export function bookDeleteMessageToString(message: BookDeleteMessage): string {
  return message.message;
}

/** Ported from the `BookDeleteMessage(Book book, bool deleteFiles)` constructor. */
export function createBookDeleteMessage(book: Book, deleteFiles: boolean): BookDeleteMessage {
  const deletedFilesMessage = deleteFiles
    ? "Book removed and all files were deleted"
    : "Book removed, files were not deleted";

  return {
    book,
    deletedFiles: deleteFiles,
    deletedFilesMessage,
    message: `${book.title} - ${deletedFilesMessage}`,
  };
}
