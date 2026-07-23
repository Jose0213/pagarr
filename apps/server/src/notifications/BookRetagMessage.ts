import type { Author, Book } from "../books/models.js";
import type { BookFile } from "../media-files-import/bookFile.js";

/**
 * Ported from NzbDrone.Core/Notifications/BookRetagMessage.cs.
 *
 * C#'s `Dictionary<string, Tuple<string, string>> Diff` (field name ->
 * (oldValue, newValue) pair) has no built-in tuple type in TS -- ported as a
 * `Record<string, [string, string]>` (a 2-tuple array), the natural TS
 * analog with identical indexing/iteration semantics
 * (`Object.entries(diff)` yields the same `[key, [old, new]]` shape
 * `dict.Select(x => ...)` iteration would in C#).
 */
export interface BookRetagMessage {
  message: string;
  author: Author | null;
  book: Book | null;
  bookFile: BookFile | null;
  diff: Record<string, [string, string]>;
  scrubbed: boolean;
}

/** Ported from `BookRetagMessage.ToString()`. */
export function bookRetagMessageToString(message: BookRetagMessage): string {
  return message.message;
}
