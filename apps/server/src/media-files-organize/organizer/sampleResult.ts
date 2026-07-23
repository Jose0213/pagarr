import type { Author, Book } from "../../books/models.js";
import type { BookFileLike } from "./fileNameBuilder.js";

/** Ported from NzbDrone.Core/Organizer/SampleResult.cs. */
export interface SampleResult {
  fileName: string;
  author: Author;
  book: Book;
  bookFile: BookFileLike;
}
