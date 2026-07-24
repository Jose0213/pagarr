import type { AuthorWithQualityProfile } from "../../../decision-engine/remoteBook.js";
import type { DownloadDecision } from "../../../decision-engine/index.js";
import { getIndex } from "../../../profiles/qualities/qualityProfile.js";
import { releaseResourceFromDecision, type ReleaseResource } from "./ReleaseResource.js";

/**
 * Ported from Readarr.Api.V1/Indexers/ReleaseModuleBase.cs's
 * `ReleaseControllerBase : RestController<ReleaseResource>`.
 *
 * `GetResourceById`/`GetResourceByIdWithErrorHandler` are `[NonAction]`/
 * `throw new NotImplementedException()` in the real source -- releases have
 * no GET-by-id route at all (see `ReleaseController`: only `GET /` and
 * `POST /`), so neither is ported here; there's nothing for a Node/Express
 * caller to invoke.
 */

/**
 * Ported from `ReleaseControllerBase.MapDecisions(IEnumerable<DownloadDecision>
 * decisions)`.
 */
export function mapDecisions(decisions: Iterable<DownloadDecision>): ReleaseResource[] {
  const result: ReleaseResource[] = [];

  for (const decision of decisions) {
    result.push(mapDecision(decision, result.length));
  }

  return result;
}

/**
 * Ported from `ReleaseControllerBase.MapDecision(DownloadDecision decision,
 * int initialWeight)`: maps the decision, stamps `ReleaseWeight` from the
 * caller-supplied running index, and (if the decision's remote book has a
 * resolved author with a quality profile) computes `QualityWeight` from the
 * profile's quality index (via the real, already-ported
 * `profiles/qualities/qualityProfile.ts`'s `getIndex()`) plus revision
 * tie-breaks.
 *
 * `ReleaseController.ts`'s own `mapDecision` override adds the release-cache
 * side effect on top of this base behavior (caching `decision.remoteBook`
 * keyed by `IndexerId_Guid` for the later `POST /` download-by-guid lookup)
 * -- kept as a separate wrapper there rather than folded into this function,
 * matching the real C# `protected override ReleaseResource
 * MapDecision(...)` override calling `base.MapDecision(...)` first.
 */
export function mapDecision(decision: DownloadDecision, initialWeight: number): ReleaseResource {
  const release = releaseResourceFromDecision(decision);

  release.releaseWeight = initialWeight;

  const author = decision.remoteBook.author as AuthorWithQualityProfile | null | undefined;

  if (author?.qualityProfile) {
    release.qualityWeight = getIndex(author.qualityProfile, release.quality.quality.id).index * 100;
  }

  release.qualityWeight += release.quality.revision.real * 10;
  release.qualityWeight += release.quality.revision.version;

  return release;
}
