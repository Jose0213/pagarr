/** Barrel export for the ported `NzbDrone.Api.V1.Editions` controller group. `EditionResource` itself lives at `../books/EditionResource.ts` (shared with `BookResource.editions`) -- re-exported here for callers that only import from `resources/editions/`. */
export * from "../books/EditionResource.js";
export * from "./EditionController.js";
