import type { IHttpClient, IHttpRequestBuilderFactory } from "../http/index.js";
import { createHealthCheck, HealthCheckResult, type HealthCheck } from "./healthCheck.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/ServerSideNotificationService.cs.
 *
 * C# builds the request via `IReadarrCloudRequestBuilder.Services` (the
 * cloud-services-facing `IHttpRequestBuilderFactory`) plus
 * `BuildInfo.Version`/`OsInfo.Os`/`RuntimeInformation.OSArchitecture`/
 * `_configFileProvider.Branch` query params. Neither `IReadarrCloudRequestBuilder`
 * nor `BuildInfo`/`OsInfo` (both `NzbDrone.Common.EnvironmentInfo`) have been
 * ported by any prior phase (confirmed by grep -- see
 * `metadata-source/metadataRequestBuilder.ts`'s doc comment for the same
 * "no IReadarrCloudRequestBuilder yet" situation that module already
 * documented and narrowed around). This port takes an
 * `IHttpRequestBuilderFactory` already rooted at the cloud services base URL
 * as a constructor parameter (the same narrowing shape
 * `metadataRequestBuilder.ts` established) plus a plain `RequestMetadata`
 * struct for the four query-param values a caller supplies explicitly
 * (version/os/arch/branch), rather than reaching into unported
 * environment-info singletons.
 *
 * `ICacheManager.GetCache<List<HealthCheck>>(...).Get("ServerChecks", ...,
 * TimeSpan.FromHours(2))` (get-or-compute with a 2-hour TTL) is ported as a
 * plain in-memory `{ value, expiresAtMs }` slot -- matching this repo's
 * established "replace ICacheManager/ICached with plain state" convention
 * (see `jobs/TaskManager.ts`'s doc comment, `config/configFileProvider.ts`'s
 * plain `Map` cache).
 */
export interface RequestMetadata {
  version: string;
  os: string;
  arch: string;
  branch: string;
}

/** Minimal logger surface this service needs. */
export interface ServerSideNotificationServiceLogger {
  trace(message: string, ...args: unknown[]): void;
  error(errorOrMessage: unknown, message?: string, ...args: unknown[]): void;
}

const noopLogger: ServerSideNotificationServiceLogger = {
  trace: () => {},
  error: () => {},
};

/** Minimal clock seam so tests can control cache expiry without real timers. */
export interface ServerSideNotificationServiceClock {
  now(): number;
}

const realClock: ServerSideNotificationServiceClock = { now: () => Date.now() };

const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export interface IServerSideNotificationService {
  getServerChecks(): Promise<HealthCheck[]>;
}

interface ServerNotificationResponse {
  Type: HealthCheckResult;
  Message: string;
  WikiUrl: string | null;
}

export class ServerSideNotificationService implements IServerSideNotificationService {
  private cached: { value: HealthCheck[]; expiresAtMs: number } | null = null;

  constructor(
    private readonly client: IHttpClient,
    private readonly cloudRequestBuilder: IHttpRequestBuilderFactory,
    private readonly requestMetadata: RequestMetadata,
    private readonly clock: ServerSideNotificationServiceClock = realClock,
    private readonly logger: ServerSideNotificationServiceLogger = noopLogger
  ) {}

  /** Ported from ServerSideNotificationService.GetServerChecks(): `_cache.Get("ServerChecks", () => RetrieveServerChecks(), TimeSpan.FromHours(2))`. */
  async getServerChecks(): Promise<HealthCheck[]> {
    const now = this.clock.now();

    if (this.cached && this.cached.expiresAtMs > now) {
      return this.cached.value;
    }

    const value = await this.retrieveServerChecks();
    this.cached = { value, expiresAtMs: now + CACHE_TTL_MS };
    return value;
  }

  /** Ported from ServerSideNotificationService.RetrieveServerChecks(). */
  private async retrieveServerChecks(): Promise<HealthCheck[]> {
    const request = this.cloudRequestBuilder
      .create()
      .resource("/notification")
      .addQueryParam("version", this.requestMetadata.version)
      .addQueryParam("os", this.requestMetadata.os.toLowerCase())
      .addQueryParam("arch", this.requestMetadata.arch)
      .addQueryParam("runtime", "netcore")
      .addQueryParam("branch", this.requestMetadata.branch)
      .build();

    try {
      this.logger.trace("Getting server side health notifications");
      const response = await this.client.execute(request);
      const result = JSON.parse(response.content) as ServerNotificationResponse[];
      return result.map((x) =>
        createHealthCheck(ServerSideNotificationService, x.Type, x.Message, x.WikiUrl)
      );
    } catch (ex) {
      this.logger.error(ex, "Failed to retrieve server notifications");
      return [];
    }
  }
}
