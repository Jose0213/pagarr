import type { IDownloadClientStatusRepository } from "../../download-clients/DownloadClientStatusRepository.js";
import { FixFutureProviderStatusTimes } from "./fixFutureProviderStatusTimes.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureDownloadClientStatusTimes.cs.
 * See fixFutureProviderStatusTimes.ts for the shared generic base's doc comment.
 */
export class FixFutureDownloadClientStatusTimes extends FixFutureProviderStatusTimes<
  Parameters<IDownloadClientStatusRepository["upsert"]>[0]
> {
  constructor(downloadClientStatusRepository: IDownloadClientStatusRepository) {
    super(downloadClientStatusRepository);
  }
}
