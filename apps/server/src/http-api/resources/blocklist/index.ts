/**
 * `apps/server/src/http-api/resources/blocklist/` -- Readarr.Api.V1/Blocklist/*
 * ported (BlocklistController + BlocklistResource + BlocklistBulkResource).
 * Mount path `/blocklist` -- see BlocklistController.ts's doc comment.
 *
 * NOT wired into `../../app.ts`'s bootstrap -- see queue/index.ts's doc
 * comment for why (same convention applies here).
 */
export {
  blocklistController,
  type BlocklistControllerOptions,
  type AuthorLookup,
} from "./BlocklistController.js";
export { toBlocklistResource, type BlocklistResource } from "./BlocklistResource.js";
export type { BlocklistBulkResource } from "./BlocklistBulkResource.js";
