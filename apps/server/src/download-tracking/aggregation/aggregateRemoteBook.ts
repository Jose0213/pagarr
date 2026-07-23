import type { RemoteBook } from "../../parser/model/remoteBook.js";

/**
 * Ported from NzbDrone.Core/Download/Aggregation/Aggregators/IAggregateRemoteBook.cs.
 *
 * Uses Parser's real `RemoteBook` (not DecisionEngine's forward-ref) since
 * `RemoteBookAggregationService.Augment` is called from
 * `PendingReleaseService.IncludeRemoteBooks` (this module's real C# source)
 * on a `RemoteBook` freshly built via `ParsingService`/`new RemoteBook{...}`
 * -- the actual `NzbDrone.Core.Parser.Model.RemoteBook` type, per this
 * module's task instructions to import Parser types directly.
 *
 * No concrete `IAggregateRemoteBook` implementations exist in Readarr's own
 * `NzbDrone.Core/Download/Aggregation/Aggregators/` directory (checked: it
 * contains only this interface) -- `RemoteBookAggregationService`'s real
 * augmenter list comes entirely from other, unrelated modules registering
 * themselves via DI-container auto-discovery of `IAggregateRemoteBook`
 * implementers elsewhere in the app (none of which exist in this port yet).
 * Per this module's task instructions ("explicit array instead of
 * reflection, matching DecisionEngine's `createDefaultSpecifications()`"),
 * `createDefaultAggregators()` below is the explicit array analogue --
 * currently empty since there is nothing to aggregate yet, but any future
 * `IAggregateRemoteBook` port should be added to this array, not
 * auto-discovered.
 */
export interface IAggregateRemoteBook {
  aggregate(remoteBook: RemoteBook): RemoteBook;
}

/** Ported from DI-container auto-discovery of every `IAggregateRemoteBook` implementation -- see module doc comment for why this is empty today. */
export function createDefaultAggregators(): IAggregateRemoteBook[] {
  return [];
}
