import type { IIndexerStatusRepository } from "../../indexers/IndexerStatusRepository.js";
import { FixFutureProviderStatusTimes } from "./fixFutureProviderStatusTimes.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureIndexerStatusTimes.cs.
 * See fixFutureProviderStatusTimes.ts for the shared generic base's doc comment.
 */
export class FixFutureIndexerStatusTimes extends FixFutureProviderStatusTimes<
  Parameters<IIndexerStatusRepository["upsert"]>[0]
> {
  constructor(indexerStatusRepository: IIndexerStatusRepository) {
    super(indexerStatusRepository);
  }
}
