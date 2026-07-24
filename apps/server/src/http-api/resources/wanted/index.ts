/**
 * `apps/server/src/http-api/resources/wanted/` -- Readarr.Api.V1/Wanted/*
 * ported (CutoffController at `/wanted/cutoff`, MissingController at
 * `/wanted/missing`). See each file's own doc comment for the exact C#
 * source, mount path, and the `BookResource`/`IBookCutoffService` forward-ref
 * gaps this worktree's scope doesn't own.
 *
 * NOT wired into `../../app.ts`'s bootstrap -- see queue/index.ts's doc
 * comment for why (same convention applies here).
 */
export { cutoffController, type CutoffControllerOptions } from "./CutoffController.js";
export { missingController, type MissingControllerOptions } from "./MissingController.js";
export { toWantedBookResource, type WantedBookResource } from "./WantedBookResource.js";
