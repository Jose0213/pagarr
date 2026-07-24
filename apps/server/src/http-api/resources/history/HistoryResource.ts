import type { EntityHistory } from "../../../history/entityHistory.js";
import type { QualityModel } from "../../../qualities/qualityModel.js";
import type { CustomFormat } from "../../../profiles/customFormat.js";
import type { RestResource } from "../../rest/RestResource.js";
import { authorToResource, type AuthorResource } from "../author/AuthorResource.js";
import { bookToResource, type BookResource } from "../books/BookResource.js";
import { toCustomFormatResource } from "../shared/embeddedResources.js";

/**
 * Ported from Readarr.Api.V1/History/HistoryResource.cs.
 *
 * `Author`/`Book` embed the real `AuthorResource`/`BookResource` --
 * repointed during merge reconciliation from this worktree's original
 * narrow forward-ref stand-ins, same as `queue/QueueResource.ts`'s
 * identical repoint; see that file's doc comment.
 */
export interface HistoryResource extends RestResource {
  bookId: number;
  authorId: number;
  sourceTitle: string;
  quality: QualityModel;
  customFormats?: { id: number; name: string }[];
  customFormatScore: number;
  qualityCutoffNotMet: boolean;
  /** ISO 8601 timestamp string. */
  date: string;
  downloadId: string | null;
  eventType: EntityHistory["eventType"];
  data: Record<string, string | undefined>;
  book?: BookResource | null;
  author?: AuthorResource | null;
}

/**
 * Ported from `HistoryResourceMapper.ToResource(this EntityHistory model,
 * ICustomFormatCalculationService formatCalculator)`.
 *
 * `customFormats`/`customFormatScore` are supplied pre-computed by the
 * caller (`HistoryController.MapToResource` calls
 * `_formatCalculator.ParseCustomFormat(model, model.Author)` -- the real,
 * ported `CustomFormatCalculationService.parseCustomFormatForHistory`,
 * which needs the hydrated `Author` this mapper function itself doesn't
 * have direct access to build without the caller's own service
 * dependencies -- so the controller computes both and passes them in,
 * matching how `QueueResource.ts`'s `toQueueResource` takes a
 * pre-resolved `QualityProfile` for the identical reason).
 */
export function toHistoryResource(
  model: EntityHistory,
  customFormats: CustomFormat[],
  customFormatScore: number
): HistoryResource {
  return {
    id: model.id,
    bookId: model.bookId,
    authorId: model.authorId,
    sourceTitle: model.sourceTitle,
    quality: model.quality,
    customFormats: customFormats.map(toCustomFormatResource),
    customFormatScore,
    // Set by the caller after this mapper returns -- see HistoryController.ts's
    // `mapToResource` (ported from `HistoryController.MapToResource`'s own
    // post-mapping `if (model.Author != null) { resource.QualityCutoffNotMet
    // = ... }` step, which needs `IUpgradableSpecification` this pure mapper
    // doesn't take a dependency on).
    qualityCutoffNotMet: false,
    date: model.date,
    downloadId: model.downloadId,
    eventType: model.eventType,
    data: model.data,
  };
}

export { authorToResource, bookToResource };
