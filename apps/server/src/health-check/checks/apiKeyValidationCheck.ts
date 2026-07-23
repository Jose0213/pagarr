import type { CheckOnEntry } from "../checkOnAttribute.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/ApiKeyValidationCheck.cs.
 *
 * `[CheckOn(typeof(ApplicationStartedEvent))]` is NOT reproduced in
 * `CHECK_ON` below: `ApplicationStartedEvent` is `NzbDrone.Core.Lifecycle`,
 * not ported (see `healthCheckService.ts`'s doc comment -- startup checks
 * already run via `handleApplicationStarted()`/`checkOnStartup`, so this
 * omission doesn't lose behavior, only the *event-driven re-check on that
 * specific event* which has no event object to subscribe to yet).
 * `[CheckOn(typeof(ConfigSavedEvent))]` is also NOT reproduced -- `config/
 * configService.ts`'s `ConfigService` exists for real, but `ConfigSavedEvent`
 * itself is still a plain callback (`onConfigSaved`) there, not yet a real
 * `IEvent` class published through `IEventAggregator` (see that file's doc
 * comment) -- so there's no concrete `ConfigSavedEvent` class to reference
 * here either. Once Configuration is retrofitted to publish a real event
 * through the Messaging bus, add `checkOn(ConfigSavedEvent)` to this list.
 */

/** Minimal config surface this check needs -- matches `config/configFileProvider.ts`'s `ConfigFileProvider.apiKey` getter. */
export interface ApiKeyValidationCheckConfig {
  readonly apiKey: string;
}

/** Minimal logger surface this check needs. */
export interface ApiKeyValidationCheckLogger {
  warn(message: string, ...args: unknown[]): void;
}

const noopLogger: ApiKeyValidationCheckLogger = { warn: () => {} };

const MINIMUM_LENGTH = 20;

export const CHECK_ON: CheckOnEntry[] = [];

export class ApiKeyValidationCheck extends HealthCheckBase {
  constructor(
    private readonly configFileProvider: ApiKeyValidationCheckConfig,
    localizationService: ILocalizationService,
    private readonly logger: ApiKeyValidationCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    if (this.configFileProvider.apiKey.length < MINIMUM_LENGTH) {
      this.logger.warn(
        "Please update your API key to be at least {0} characters long. You can do this via settings or the config file",
        MINIMUM_LENGTH
      );

      return createHealthCheck(
        ApiKeyValidationCheck,
        HealthCheckResult.Warning,
        formatMessage(
          this.localizationService.getLocalizedString("ApiKeyValidationHealthCheckMessage"),
          MINIMUM_LENGTH
        ),
        "#invalid-api-key"
      );
    }

    return createOkHealthCheck(ApiKeyValidationCheck);
  }
}
