import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { ProviderUpdatedEvent } from "../../thingi-provider/events/ProviderUpdatedEvent.js";
import { ProviderDeletedEvent } from "../../thingi-provider/events/ProviderDeletedEvent.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/ImportMechanismCheck.cs.
 *
 * `[CheckOn(typeof(ConfigSavedEvent))]` NOT reproduced -- `ConfigSavedEvent`
 * is still a plain callback (`onConfigSaved`) on `config/configService.ts`'s
 * `ConfigService`, not yet a real `IEvent` class (see that file's doc
 * comment) -- same gap `apiKeyValidationCheck.ts`'s doc comment already
 * documents. `ProviderUpdatedEvent<IDownloadClient>`/`ProviderDeletedEvent`
 * ARE reproduced -- see `downloadClientCheck.ts`'s doc comment.
 *
 * `ImportMechanismCheckStatus` (a small public DTO the real C# file also
 * declares alongside the check, `{ IDownloadClient DownloadClient;
 * DownloadClientInfo Status; }`) is not referenced anywhere else in the real
 * HealthCheck module or by this check's own `Check()` body -- it looks like
 * dead/unused code in the original (preserved as a comment here rather than
 * a real port, since porting an unused type just to be "faithful" adds
 * nothing testable and the real file itself never constructs one).
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(ProviderUpdatedEvent, CheckOnCondition.Always),
  checkOn(ProviderDeletedEvent, CheckOnCondition.Always),
];

/** Minimal config surface this check needs. */
export interface ImportMechanismCheckConfig {
  readonly enableCompletedDownloadHandling: boolean;
}

export class ImportMechanismCheck extends HealthCheckBase {
  constructor(
    private readonly configService: ImportMechanismCheckConfig,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    if (!this.configService.enableCompletedDownloadHandling) {
      return createHealthCheck(
        ImportMechanismCheck,
        HealthCheckResult.Warning,
        this.localizationService.getLocalizedString("ImportMechanismHealthCheckMessage"),
        "#completed-download-handling-is-disabled"
      );
    }

    return createOkHealthCheck(ImportMechanismCheck);
  }
}
