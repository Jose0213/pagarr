import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import { ProviderStatusChangedEvent } from "../../thingi-provider/events/ProviderStatusChangedEvent.js";
import type { ProviderStatusBase } from "../../thingi-provider/status/ProviderStatusBase.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/ImportListStatusCheck.cs.
 *
 * FORWARD-REFERENCE: `IImportListFactory`/`IImportListStatusService`
 * (`NzbDrone.Core.ImportLists`) not ported -- see
 * `importListRootFolderCheck.ts`'s doc comment for the same gap. Narrowed to
 * `getAvailableProviders(): { definition: { id, name } }[]` (the shape
 * `ProviderFactory.GetAvailableProviders()` would produce) and
 * `IImportListStatusService`, whose real shape is the same
 * `ProviderStatusServiceBase<TProvider, TModel>` (ported for real at
 * `thingi-provider/status/ProviderStatusServiceBase.ts`) every other
 * provider-kind status service already narrows from -- so this uses the
 * real `IProviderStatusServiceBase<ProviderStatusBase>` shape directly
 * rather than inventing yet another structurally-identical copy.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
  checkOn(ProviderStatusChangedEvent, CheckOnCondition.Always),
];

export interface ImportListProviderLike {
  definition: { id: number; name: string };
}

export interface ImportListFactoryProviderLike {
  getAvailableProviders(): ImportListProviderLike[];
}

export interface ImportListStatusServiceLike {
  getBlockedProviders(): ProviderStatusBase[];
}

export class ImportListStatusCheck extends HealthCheckBase {
  constructor(
    private readonly providerFactory: ImportListFactoryProviderLike,
    private readonly providerStatusService: ImportListStatusServiceLike,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const enabledProviders = this.providerFactory.getAvailableProviders();
    const blockedById = new Map(
      this.providerStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );
    const backOffProviders = enabledProviders.filter((p) => blockedById.has(p.definition.id));

    if (backOffProviders.length === 0) {
      return createOkHealthCheck(ImportListStatusCheck);
    }

    if (backOffProviders.length === enabledProviders.length) {
      return createHealthCheck(
        ImportListStatusCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("ImportListStatusCheckAllClientMessage"),
        "#import-lists-are-unavailable-due-to-failures"
      );
    }

    return createHealthCheck(
      ImportListStatusCheck,
      HealthCheckResult.Warning,
      formatMessage(
        this.localizationService.getLocalizedString("ImportListStatusCheckSingleClientMessage"),
        backOffProviders.map((v) => v.definition.name).join(", ")
      ),
      "#import-lists-are-unavailable-due-to-failures"
    );
  }
}
