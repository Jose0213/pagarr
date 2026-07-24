/**
 * Barrel export for ImportLists' Goodreads sub-integrations.
 *
 * LIVE-SERVICE STATUS: every provider exported from this barrel talks to
 * the Goodreads Developer API, which stopped issuing new API keys in
 * December 2020 and has never reopened. This is the THIRD independent dead
 * Goodreads touchpoint found across this project's history -- see
 * `GoodreadsSettingsBase.ts`'s doc comment for the full cross-reference
 * against the metadata-source (Phase 2) and notifications (Phase 4 Wave 2)
 * findings. Ported faithfully per this project's standing practice.
 */

export * from "./GoodreadsException.js";
export * from "./GoodreadsSettingsBase.js";
export * from "./GoodreadsImportListBase.js";
export * from "./goodreadsXmlResources.js";

export * from "./bookshelf/GoodreadsBookshelfImportListSettings.js";
export * from "./bookshelf/GoodreadsBookshelf.js";

export * from "./owned-books/GoodreadsOwnedBooksImportListSettings.js";
export * from "./owned-books/GoodreadsOwnedBooks.js";

export * from "./lists/GoodreadsListImportListSettings.js";
export * from "./lists/GoodreadsListImportList.js";

export * from "./series/GoodreadsSeriesImportListSettings.js";
export * from "./series/GoodreadsSeriesImportList.js";
