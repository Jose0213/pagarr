/**
 * Barrel export for the ported `Readarr.Api.V1.Books` controller group.
 * See this directory's individual files for per-controller port notes; see
 * this worktree's final report for mount-path conventions and SignalR
 * wiring. NOT wired into `http-api/app.ts` here -- callers mount each
 * returned `Router` themselves (see this module's task brief).
 *
 * `AuthorResource` (and its mapper functions) used to have a narrow local
 * forward-ref stand-in here -- this worktree's own scope is `Books/`,
 * `Editions/`, `Series/`, `BookShelf/`, not the full `Author/` controller
 * group -- superseded during merge reconciliation once the real
 * `resources/author/AuthorResource.ts` landed (see that file's own doc
 * comment). Re-export it from there for anything that imported the old
 * stand-in via this barrel.
 */

export type { AuthorResource } from "../author/AuthorResource.js";
export {
  authorToResource,
  authorResourceToModel,
  authorsToResources,
} from "../author/AuthorResource.js";
export * from "./EditionResource.js";
export * from "./BookStatisticsResource.js";
export * from "./BookResource.js";
export * from "./BookEditorResource.js";
export * from "./BooksMonitoredResource.js";
export * from "./RenameBookResource.js";
export * from "./RetagBookResource.js";

export * from "./BookController.js";
export * from "./BookEditorController.js";
export * from "./BookLookupController.js";
export * from "./RenameBookController.js";
export * from "./RetagBookController.js";
