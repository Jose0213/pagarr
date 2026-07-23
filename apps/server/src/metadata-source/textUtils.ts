/**
 * Minimal stand-ins for two NzbDrone.Common.Extensions.StringExtensions
 * helpers (`CleanSpaces`, `ToLastFirst`) that BookInfoProxy's mapping code
 * (`MapAuthorMetadata`, `MapEdition`) calls directly as C# extension
 * methods. Those live in the Parser/Common-extensions surface, which is a
 * Phase 2 dependency not yet ported into this worktree -- see
 * `books/textMatching.ts`'s module doc comment and db/migrations/0009's SQL
 * comment for the identical, already-established precedent of deferring
 * `ToLastFirst`'s real last-first name-parsing algorithm (it splits on
 * copywords/surname-prefixes/bracketed suffixes -- see
 * StringExtensions.cs's `ToLastFirst`, ported from calibre's
 * metadata/__init__.py) rather than silently reimplementing it here as a
 * side effect of porting MetadataSource.
 *
 * `cleanSpaces` (collapse runs of whitespace + trim) has no such nontrivial
 * algorithm behind it, so it's ported in full below -- it's a one-line
 * regex, not a deferred dependency.
 *
 * `toLastFirstPlaceholder` intentionally does NOT attempt the real
 * "First Last" -> "Last, First" transform; it's a byte-identical passthrough
 * (same "no NAME transform yet" placeholder shape as migration 0009's
 * `lower(Name)` SortName backfill) so `AuthorMetadata.nameLastFirst` /
 * `sortNameLastFirst` are populated with *something* schema-valid rather
 * than thrown away, without a sub-agent quietly reimplementing calibre's
 * name-parsing rules as a one-off inside a provider client. Whichever
 * future module ports NzbDrone.Common.Extensions should replace this
 * function's body (not its call sites).
 */

const COLLAPSE_SPACE = /\s+/g;

/** Ported in full from StringExtensions.CleanSpaces(this string text). */
export function cleanSpaces(text: string): string {
  return text.replace(COLLAPSE_SPACE, " ").trim();
}

/** Placeholder for StringExtensions.ToLastFirst(this string author) -- see module doc comment. */
export function toLastFirstPlaceholder(author: string): string {
  return author;
}
