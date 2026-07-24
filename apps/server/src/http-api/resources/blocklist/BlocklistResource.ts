import type { Blocklist } from "../../../blocklisting/blocklist.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { toCustomFormatResource } from "../shared/embeddedResources.js";

/**
 * Ported from Readarr.Api.V1/Blocklist/BlocklistResource.cs.
 *
 * `Author` embeds the real `AuthorResource` -- repointed during merge
 * reconciliation from this worktree's original narrow forward-ref
 * stand-in, same as `queue/QueueResource.ts`'s identical repoint; see that
 * file's doc comment.
 */
export interface BlocklistResource extends RestResource {
  authorId: number;
  bookIds: number[];
  sourceTitle: string;
  quality: QualityModel;
  customFormats?: { id: number; name: string }[];
  /** ISO 8601 timestamp string. */
  date: string;
  protocol: DownloadProtocol;
  indexer: string | null;
  message: string | null;
  author?: AuthorResource | null;
}

/**
 * Ported from `BlocklistResourceMapper.MapToResource(this Blocklist model,
 * ICustomFormatCalculationService formatCalculator)`.
 *
 * The real C# source dereferences `model.Author.ToResource()`
 * unconditionally (no null-check) -- `Author` is always populated here per
 * `BlocklistController.GetBlocklist`'s underlying `PagedBuilder` join. This
 * port's `blocklistRepository.getPaged()` does NOT join Author (see that
 * file's own doc comment: "no API layer consumes paged Blocklist listings
 * yet" -- this module is now that consumer), so `author` is supplied
 * pre-resolved by the caller instead of being read off `model.author`
 * directly, matching this port's established pattern of injecting a
 * resolved collaborator rather than asserting a possibly-unpopulated
 * LazyLoaded field is present (see HistoryResource.ts's identical
 * `customFormats`/`customFormatScore` injection for the same reason).
 */
export function toBlocklistResource(
  model: Blocklist,
  author: AuthorResource | null,
  customFormats: CustomFormat[]
): BlocklistResource {
  return {
    id: model.id,
    authorId: model.authorId,
    bookIds: model.bookIds,
    sourceTitle: model.sourceTitle,
    quality: model.quality,
    customFormats: customFormats.map(toCustomFormatResource),
    date: model.date,
    protocol: model.protocol,
    indexer: model.indexer,
    message: model.message,
    author,
  };
}

export { authorToResource };
