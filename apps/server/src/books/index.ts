/**
 * Barrel export for the Books module -- port of NzbDrone.Core/Books/*.cs.
 * See PORT_PLAN.md's Phase 1 for how this module fits into the rest of
 * Pagarr, and this module's own files for what's ported vs. deferred
 * (Calibre/, Commands/, Handlers/, Refresh*Service, AddAuthorService,
 * AddBookService, BookCutoffService, MoveAuthorService -- see the doc
 * comments on authorService.ts, bookService.ts, bookRepository.ts, and
 * events.ts for the specific unported-dependency reasons).
 */

export * from "./models.js";
export * from "./events.js";
export * from "./textMatching.js";

export * from "./authorMetadataRepository.js";
export * from "./authorRepository.js";
export * from "./bookRepository.js";
export * from "./editionRepository.js";
export * from "./seriesRepository.js";
export * from "./seriesBookLinkRepository.js";

export * from "./authorMetadataService.js";
export * from "./authorService.js";
export * from "./bookService.js";
export * from "./editionService.js";
export * from "./seriesService.js";
export * from "./seriesBookLinkService.js";
export * from "./bookMonitoredService.js";
export * from "./monitorNewBookService.js";
