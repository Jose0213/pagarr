import type { IHttpClient, IHttpRequestBuilderFactory } from "../../http/index.js";
import type { CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/SystemTimeCheck.cs. No
 * `[CheckOn]` attributes on the real C# class.
 *
 * `IReadarrCloudRequestBuilder.Services` -- same narrowing as
 * `serverSideNotificationService.ts`/`proxyCheck.ts`: an already-rooted
 * `IHttpRequestBuilderFactory` constructor parameter.
 */
export const CHECK_ON: CheckOnEntry[] = [];

interface ServiceTimeResponse {
  DateTimeUtc: string;
}

/** Clock seam so tests can control "now" without real timers. */
export interface SystemTimeCheckClock {
  now(): number;
}

const realClock: SystemTimeCheckClock = { now: () => Date.now() };

/** Minimal logger surface this check needs. */
export interface SystemTimeCheckLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: SystemTimeCheckLogger = { error: () => {} };

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class SystemTimeCheck extends HealthCheckBase {
  constructor(
    private readonly client: IHttpClient,
    private readonly cloudRequestBuilder: IHttpRequestBuilderFactory,
    localizationService: ILocalizationService,
    private readonly clock: SystemTimeCheckClock = realClock,
    private readonly logger: SystemTimeCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    const request = this.cloudRequestBuilder.create().resource("/time").build();

    const response = await this.client.execute(request);
    const result = JSON.parse(response.content) as ServiceTimeResponse;
    const systemTimeMs = this.clock.now();
    const expectedTimeMs = new Date(result.DateTimeUtc).getTime();

    // +/- more than 1 day
    if (Math.abs(expectedTimeMs - systemTimeMs) >= ONE_DAY_MS) {
      this.logger.error(
        "System time mismatch. SystemTime: {0} Expected Time: {1}. Update system time",
        new Date(systemTimeMs).toISOString(),
        result.DateTimeUtc
      );
      return createHealthCheck(
        SystemTimeCheck,
        HealthCheckResult.Error,
        this.localizationService.getLocalizedString("SystemTimeCheckMessage"),
        "#system-time-off"
      );
    }

    return createOkHealthCheck(SystemTimeCheck);
  }
}
