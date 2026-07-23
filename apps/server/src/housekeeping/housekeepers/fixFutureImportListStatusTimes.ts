import type { IProviderStatusRepositoryLike } from "../../thingi-provider/status/ProviderStatusServiceBase.js";
import type { ProviderStatusBase } from "../../thingi-provider/status/ProviderStatusBase.js";
import { FixFutureProviderStatusTimes } from "./fixFutureProviderStatusTimes.js";

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/FixFutureImportListStatusTimes.cs.
 *
 * `IImportListStatusRepository` doesn't exist yet (ImportLists module not
 * ported -- see ../providerStatusRepositories.ts's doc comment); the
 * constructor takes the real `IProviderStatusRepositoryLike<ProviderStatusBase>`
 * shape instead, satisfied today by `ImportListStatusRepositoryForCleanup`.
 */
export class FixFutureImportListStatusTimes extends FixFutureProviderStatusTimes<ProviderStatusBase> {
  constructor(importListStatusRepository: IProviderStatusRepositoryLike<ProviderStatusBase>) {
    super(importListStatusRepository);
  }
}
