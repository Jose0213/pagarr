/**
 * Barrel export for the Author resource-controller module -- port of
 * `Readarr.Api.V1/Author/*.cs` (9 files). See PORT_PLAN.md's Phase 5 for how
 * this module fits into the rest of Pagarr, and each file's own doc comment
 * for deviations/forward-refs. Not wired into `http-api/app.ts`'s bootstrap
 * by this module itself -- a caller mounts the returned routers explicitly,
 * e.g.:
 *
 *   const { router: authorRouter } = authorController({ ... });
 *   app.mountResource("/api/v1/author", authorRouter);
 *   app.mountResource("/api/v1/author/editor", authorEditorController({ ... }));
 *   app.mountResource("/api/v1/author/lookup", authorLookupController({ ... }));
 */

export * from "./AlternateTitleResource.js";
export * from "./AuthorStatisticsResource.js";
export * from "./AuthorResource.js";
export * from "./AuthorFolderAsRootFolderValidator.js";
export * from "./authorCommands.js";
export * from "./AuthorController.js";
export * from "./AuthorEditorResource.js";
export * from "./AuthorEditorDeleteResource.js";
export * from "./AuthorEditorController.js";
export * from "./AuthorLookupController.js";
