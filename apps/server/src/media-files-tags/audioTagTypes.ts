/**
 * Forward-references / narrow local types shared by audioTag.ts and
 * audioTagService.ts.
 *
 * `BookFile` is `NzbDrone.Core/MediaFiles/BookFile.cs` (Phase 3, being
 * ported concurrently in the sibling `media-files-import` worktree, not
 * merged yet). `Edition`/`Book`/`Author` are the real, already-landed
 * `apps/server/src/books/` models (Phase 1) -- both already carry the
 * `book?: Book` / `author?: Author` relations this module needs, so no
 * forward-ref narrowing is needed for them.
 *
 * `apps/server/src/decision-engine/mediaFile.ts` already established the
 * pattern this module follows for the un-ported `BookFile`: a minimal
 * local forward-ref interface covering only the fields this module's call
 * sites actually read/write (`path`, `calibreId`, `edition`, `author`,
 * `part`, `size`, `modified`, `id`), not the full real `BookFile.cs`
 * shape. `Edition.bookFiles` (`Edition.BookFiles`, a
 * `LazyLoaded<List<BookFile>>` in C#) is likewise not part of the real
 * ported `Edition` yet (since `BookFile` itself isn't ported), so it's
 * added here as an optional extension field via `EditionRef`. When the
 * media-files-import module lands, `BookFileRef`/`EditionRef` can be
 * swapped for the real types without changing any call site here.
 */

import type { Author, Edition } from "../books/models.js";

/** Forward-ref for the slice of NzbDrone.Core/MediaFiles/BookFile.cs this module needs. */
export interface BookFileRef {
  id: number;
  path: string;
  calibreId: number;
  part: number;
  size: number;
  modified: string;
  edition?: EditionRef;
  author?: Author;
}

/** The real ported `Edition` plus `bookFiles` (Edition.BookFiles -- see module doc comment for why it's not on the real type yet). */
export interface EditionRef extends Edition {
  bookFiles?: BookFileRef[];
}
