/**
 * `apps/server/src/http-api/resources/history/` -- Readarr.Api.V1/History/*
 * ported (HistoryController + HistoryResource). See HistoryController.ts's
 * doc comment for the exact C# source and mount path (`/history`).
 *
 * NOT wired into `../../app.ts`'s bootstrap -- see queue/index.ts's doc
 * comment for why (same convention applies here).
 */
export {
  historyController,
  type HistoryControllerOptions,
  type AuthorLookup,
} from "./HistoryController.js";
export { toHistoryResource, type HistoryResource } from "./HistoryResource.js";
