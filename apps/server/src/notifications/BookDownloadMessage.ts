import type { Author, Book } from "../books/models.js";
import type { BookFile } from "../media-files-import/bookFile.js";
import type { DownloadClientItemClientInfo } from "../download-clients/DownloadClientItem.js";

/**
 * Ported from NzbDrone.Core/Notifications/BookDownloadMessage.cs.
 *
 * All fields are optional/nullable here even though several are
 * non-nullable in C# (`Author`/`Book`/`BookFiles`/`OldFiles`): the real
 * `NotificationService.Handle(BookImportIncompleteEvent)` constructs a
 * `BookDownloadMessage` with ONLY `Message` set (see NotificationService.cs's
 * `Handle(BookImportIncompleteEvent message)` -- a genuine partially-
 * populated-DTO pattern in the original, not a translation gap), so this
 * port's shape has to tolerate that partial-construction use case too.
 */
export interface BookDownloadMessage {
  message: string;
  author: Author | null;
  book: Book | null;
  bookFiles: BookFile[] | null;
  oldFiles: BookFile[] | null;
  downloadClientInfo: DownloadClientItemClientInfo | null;
  downloadId: string | null;
}

/** Ported from `BookDownloadMessage.ToString()`. */
export function bookDownloadMessageToString(message: BookDownloadMessage): string {
  return message.message;
}
