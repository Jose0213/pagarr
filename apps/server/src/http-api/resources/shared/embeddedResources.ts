import type { Book } from "../../../books/models.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import { customFormatToResource } from "../CustomFormats/CustomFormatResource.js";

/**
 * FORWARD-REFERENCE: minimal `BookResource` shape, used ONLY where a full
 * `resources/books/BookResource.ts` round-trip isn't wired up yet (see
 * `wanted/WantedBookResource.ts`'s doc comment for exactly why -- the real
 * `BookControllerWithSignalR.MapToResource` needs three extra service
 * dependencies `Wanted/CutoffController.ts`/`MissingController.ts` don't
 * currently take).
 *
 * The former `EmbeddedAuthorResource`/`toEmbeddedAuthorResource` (this
 * module used to declare both, for the identical reason) were deleted
 * during merge reconciliation once the real `AuthorResource` landed at
 * `resources/author/AuthorResource.ts` -- unlike `BookResource`'s embed,
 * embedding a full `AuthorResource` needed no extra dependencies beyond an
 * `Author` every consumer already had on hand, so every call site (queue/
 * history/blocklist/wanted) was repointed directly to
 * `resources/author/AuthorResource.ts`'s `authorToResource` rather than
 * kept behind a narrower stand-in. `EmbeddedBookResource`/
 * `toEmbeddedBookResource` remain here until `wanted/`'s controllers gain
 * the statistics/series-links/cover-mapper wiring needed to call the real
 * `resources/books/BookResource.ts` mapper directly -- the field names
 * below already match the real C# resource's camelCased equivalents 1:1 so
 * that eventual swap is mechanical, not a redesign.
 */

export interface EmbeddedBookResource {
  id: number;
  title: string;
  authorMetadataId: number;
  foreignBookId: string;
  monitored: boolean;
  anyEditionOk: boolean;
  releaseDate: string | null;
  pageCount?: number;
  genres: string[];
  ratings: Book["ratings"];
  cleanTitle: string;
}

/** Ported spirit of `BookResourceMapper.ToResource(Book)`, narrowed per this module's doc comment. */
export function toEmbeddedBookResource(book: Book): EmbeddedBookResource {
  return {
    id: book.id,
    title: book.title,
    authorMetadataId: book.authorMetadataId,
    foreignBookId: book.foreignBookId,
    monitored: book.monitored,
    anyEditionOk: book.anyEditionOk,
    releaseDate: book.releaseDate,
    genres: book.genres,
    ratings: book.ratings,
    cleanTitle: book.cleanTitle,
  };
}

/**
 * Ported from `CustomFormatResourceMapper.ToResource(CustomFormat model,
 * bool includeDetails)` called with `includeDetails: false` -- the only call
 * shape this worktree's C# sources use (`Queue/QueueResource.cs`,
 * `History/HistoryResource.cs`, `Blocklist/BlocklistResource.cs` all pass
 * `customFormats?.ToResource(false)`). Now calls the REAL
 * `CustomFormats/CustomFormatResource.ts`'s `customFormatToResource(model,
 * false)` directly -- repointed during merge reconciliation once that
 * module landed (`api-download-notifications`'s own scope). With
 * `includeDetails` false, only `id`/`name` are populated
 * (`includeCustomFormatWhenRenaming`/`specifications` stay unset), so this
 * worktree's narrower `profiles/customFormat.ts` `CustomFormat` forward-ref
 * (only `id`/`name`, predating the real `custom-formats/customFormat.ts`
 * module -- see that file's own "RECONCILIATION" doc-comment section, a
 * separate, wider reconciliation spanning `decision-engine/**` that's out
 * of THIS reconciliation's scope) still satisfies the real function's input
 * needs for the `false` branch -- it only reads `.id`/`.name` either way.
 */
export function toCustomFormatResource(customFormat: CustomFormat): { id: number; name: string } {
  return customFormatToResource(customFormat, false);
}
