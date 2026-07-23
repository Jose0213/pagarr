import { lookup } from "node:dns/promises";
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
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/ProxyCheck.cs.
 *
 * `[CheckOn(typeof(ConfigSavedEvent))]` NOT reproduced -- see
 * `apiKeyValidationCheck.ts`'s doc comment (`ConfigSavedEvent` still a plain
 * callback, not a real `IEvent`).
 *
 * `Dns.GetHostAddresses` -> Node's `dns.promises.lookup` (resolves a
 * hostname to at least one address, throwing `ENOTFOUND` if none exist --
 * the direct behavioral analog needed here: "did resolution find any
 * address at all").
 *
 * `IReadarrCloudRequestBuilder.Services` -- same not-ported-anywhere
 * `IReadarrCloudRequestBuilder` gap `serverSideNotificationService.ts`'s
 * doc comment documents; narrowed to an already-rooted
 * `IHttpRequestBuilderFactory` constructor parameter, same shape.
 */
export const CHECK_ON: CheckOnEntry[] = [];

/** Minimal config surface this check needs. */
export interface ProxyCheckConfig {
  readonly proxyEnabled: boolean;
  readonly proxyHostname: string;
}

/** Minimal logger surface this check needs. */
export interface ProxyCheckLogger {
  error(errorOrMessage: unknown, ...args: unknown[]): void;
}

const noopLogger: ProxyCheckLogger = { error: () => {} };

export class ProxyCheck extends HealthCheckBase {
  constructor(
    private readonly cloudRequestBuilder: IHttpRequestBuilderFactory,
    private readonly configService: ProxyCheckConfig,
    private readonly client: IHttpClient,
    localizationService: ILocalizationService,
    private readonly logger: ProxyCheckLogger = noopLogger
  ) {
    super(localizationService);
  }

  async check(): Promise<HealthCheck> {
    if (this.configService.proxyEnabled) {
      let hasAddress: boolean;
      try {
        await lookup(this.configService.proxyHostname, { all: false });
        hasAddress = true;
      } catch {
        hasAddress = false;
      }

      if (!hasAddress) {
        return createHealthCheck(
          ProxyCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("ProxyCheckResolveIpMessage"),
            this.configService.proxyHostname
          ),
          "#proxy-failed-resolve-ip"
        );
      }

      const request = this.cloudRequestBuilder.create().resource("/ping").build();

      try {
        const response = await this.client.execute(request);

        // We only care about 400 responses, other error codes can be ignored
        if (response.statusCode === 400) {
          this.logger.error("Proxy Health Check failed: {0}", response.statusCode);
          return createHealthCheck(
            ProxyCheck,
            HealthCheckResult.Error,
            formatMessage(
              this.localizationService.getLocalizedString("ProxyCheckBadRequestMessage"),
              response.statusCode
            ),
            "#proxy-failed-test"
          );
        }
      } catch (ex) {
        this.logger.error(ex, "Proxy Health Check failed");
        return createHealthCheck(
          ProxyCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("ProxyCheckFailedToTestMessage"),
            request.url.toString()
          ),
          "#proxy-failed-test"
        );
      }
    }

    return createOkHealthCheck(ProxyCheck);
  }
}
