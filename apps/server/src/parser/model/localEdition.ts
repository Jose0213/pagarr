import type { Edition } from "../../books/index.js";
import type { LocalBook } from "./localBook.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/LocalEdition.cs.
 *
 * Pure data shape -- like LocalBook.cs, this is referenced only by the
 * not-yet-ported `MediaFiles.BookImport.Identification` pipeline (Phase 3),
 * not by this module's real behavioral surface.
 *
 * ## `PopulateMatch()` is intentionally NOT ported here
 *
 * The C# method clones an `Edition`/`Book`/`Author` graph (via
 * `UseMetadataFrom`/`UseDbFieldsFrom`, `SeriesLinks.IsLoaded` lazy-load
 * checks, and `BookFiles` -- a `LazyLoaded<List<BookFile>>` field that
 * doesn't exist on the ported `Book`/`Edition` in `books/models.ts`, since
 * `BookFile` is a `MediaFiles` entity not ported until Phase 3) to avoid
 * holding references to every edition seen during import matching. None of
 * that graph exists yet in this worktree -- `books/models.ts`'s `Edition`
 * has no `bookFiles` field, and there is no `Distance` type (see
 * localBook.ts's doc comment) to construct the dummy `{ book_id: 1.0 }`
 * distance this constructor seeds.
 *
 * Faithfully porting `PopulateMatch` now would mean inventing MediaFiles-
 * module fields and a stand-in `Distance` implementation as a side effect
 * of porting Parser's *models* directory -- exactly the kind of "silently
 * reimplement a dependency as a side effect" this worktree's sibling
 * modules (see books/textMatching.ts's doc comment) explicitly avoid.
 * `PopulateMatch` should be ported for real when `MediaFiles.BookImport`
 * (Phase 3) lands and the full `Edition`/`Book`/`BookFile`/`Distance` graph
 * exists to port it against.
 */
export interface LocalEdition {
  localBooks: LocalBook[];
  /** See module doc comment: placeholder for `MediaFiles.BookImport.Identification.Distance` (not yet ported). */
  distance: unknown;
  edition: Edition | null;
  existingTracks: LocalBook[] | null;
  newDownload: boolean;
}

/** Ported from the `LocalEdition()` / `LocalEdition(List<LocalBook> tracks)` constructors. */
export function newLocalEdition(localBooks: LocalBook[] = []): LocalEdition {
  return {
    localBooks,
    // A dummy distance, will be replaced -- see module doc comment re: Distance not being ported yet.
    distance: null,
    edition: null,
    existingTracks: null,
    newDownload: false,
  };
}

/** Ported from `LocalEdition.TrackCount => LocalBooks.Count`. */
export function trackCount(localEdition: LocalEdition): number {
  return localEdition.localBooks.length;
}

/**
 * Ported from `LocalEdition.ToString()`:
 * "[{comma-joined distinct directory names of each LocalBook's Path}]".
 * Uses POSIX-style `path.dirname`-equivalent splitting since this port
 * targets a single cross-platform behavior rather than C#'s
 * `Path.GetDirectoryName` (which is OS-specific); callers on Windows should
 * normalize separators before constructing `LocalBook.path` if directory
 * grouping needs to match native OS semantics exactly.
 */
export function localEditionToString(localEdition: LocalEdition): string {
  const dirNames = localEdition.localBooks.map((x) => dirname(x.path));
  const distinct = Array.from(new Set(dirNames));
  return `[${distinct.join(", ")}]`;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.substring(0, idx);
}
