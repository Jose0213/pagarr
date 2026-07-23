import type { Book } from "../books/models.js";
import type { BookFile } from "../media-files-import/bookFile.js";
import { DeleteMediaFileReason } from "../media-files-import/deleteMediaFileReason.js";

/** Ported from NzbDrone.Core/Notifications/BookFileDeleteMessage.cs. */
export interface BookFileDeleteMessage {
  message: string;
  book: Book | null;
  bookFile: BookFile | null;
  reason: DeleteMediaFileReason;
}

/** Ported from `BookFileDeleteMessage.ToString()`. */
export function bookFileDeleteMessageToString(message: BookFileDeleteMessage): string {
  return message.message;
}
