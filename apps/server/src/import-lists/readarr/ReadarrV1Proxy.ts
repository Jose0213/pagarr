import { HttpAccept } from "../../http/HttpAccept.js";
import { HttpException } from "../../http/HttpException.js";
import { HttpRequestBuilder } from "../../http/HttpRequestBuilder.js";
import type { IHttpClient } from "../../http/HttpClient.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import type {
  ReadarrAuthor,
  ReadarrBook,
  ReadarrProfile,
  ReadarrRootFolder,
  ReadarrTag,
} from "./ReadarrAPIResource.js";
import type { ReadarrSettings } from "./ReadarrSetting.js";

/** Minimal logger surface this proxy needs. */
export interface ReadarrV1ProxyLogger {
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: ReadarrV1ProxyLogger = { error: () => {} };

/**
 * Ported from NzbDrone.Core/ImportLists/Readarr/ReadarrV1Proxy.cs.
 * LIVE-SERVICE STATUS: see `ReadarrSetting.ts`'s doc comment -- calls
 * another Readarr/Pagarr instance's own `Readarr.Api.V1` REST surface,
 * which doesn't exist yet in THIS Pagarr port as of this worktree (Phase
 * 5's sibling API-controller work is building it in parallel) but is
 * otherwise a live, self-consistent integration once that surface lands.
 */
export interface IReadarrV1Proxy {
  getAuthors(settings: ReadarrSettings): Promise<ReadarrAuthor[]>;
  getBooks(settings: ReadarrSettings): Promise<ReadarrBook[]>;
  getProfiles(settings: ReadarrSettings): Promise<ReadarrProfile[]>;
  getRootFolders(settings: ReadarrSettings): Promise<ReadarrRootFolder[]>;
  getTags(settings: ReadarrSettings): Promise<ReadarrTag[]>;
  test(settings: ReadarrSettings): Promise<ValidationFailure | null>;
}

export class ReadarrV1Proxy implements IReadarrV1Proxy {
  constructor(
    private readonly httpClient: IHttpClient,
    private readonly logger: ReadarrV1ProxyLogger = noopLogger
  ) {}

  getAuthors(settings: ReadarrSettings): Promise<ReadarrAuthor[]> {
    return this.execute<ReadarrAuthor>("/api/v1/author", settings);
  }

  getBooks(settings: ReadarrSettings): Promise<ReadarrBook[]> {
    return this.execute<ReadarrBook>("/api/v1/book", settings);
  }

  getProfiles(settings: ReadarrSettings): Promise<ReadarrProfile[]> {
    return this.execute<ReadarrProfile>("/api/v1/qualityprofile", settings);
  }

  getRootFolders(settings: ReadarrSettings): Promise<ReadarrRootFolder[]> {
    return this.execute<ReadarrRootFolder>("api/v1/rootfolder", settings);
  }

  getTags(settings: ReadarrSettings): Promise<ReadarrTag[]> {
    return this.execute<ReadarrTag>("/api/v1/tag", settings);
  }

  /** Ported from `ReadarrV1Proxy.Test(ReadarrSettings)`. */
  async test(settings: ReadarrSettings): Promise<ValidationFailure | null> {
    try {
      await this.getAuthors(settings);
    } catch (ex) {
      if (ex instanceof HttpException) {
        if (ex.response.statusCode === 401) {
          this.logger.error("API Key is invalid: %s", ex);
          return { propertyName: "apiKey", errorMessage: "API Key is invalid" };
        }

        if (ex.response.hasHttpRedirect) {
          this.logger.error("Readarr returned redirect and is invalid: %s", ex);
          return {
            propertyName: "baseUrl",
            errorMessage: "Readarr URL is invalid, are you missing a URL base?",
          };
        }

        this.logger.error("Unable to connect to import list: %s", ex);
        return {
          propertyName: "",
          errorMessage: `Unable to connect to import list: ${ex.message}. Check the log surrounding this error for details.`,
        };
      }

      const message = ex instanceof Error ? ex.message : String(ex);
      this.logger.error("Unable to connect to import list: %s", ex);
      return {
        propertyName: "",
        errorMessage: `Unable to connect to import list: ${message}. Check the log surrounding this error for details.`,
      };
    }

    return null;
  }

  /** Ported from `ReadarrV1Proxy.Execute<TResource>(string, ReadarrSettings)`. */
  private async execute<TResource>(
    resource: string,
    settings: ReadarrSettings
  ): Promise<TResource[]> {
    if (
      !settings.baseUrl ||
      settings.baseUrl.trim() === "" ||
      !settings.apiKey ||
      settings.apiKey.trim() === ""
    ) {
      return [];
    }

    const baseUrl = settings.baseUrl.endsWith("/")
      ? settings.baseUrl.slice(0, -1)
      : settings.baseUrl;

    const request = new HttpRequestBuilder(baseUrl)
      .resource(resource)
      .accept(HttpAccept.Json)
      .setHeader("X-Api-Key", settings.apiKey)
      .build();

    const response = await this.httpClient.get(request);

    if (response.statusCode >= 300) {
      throw new HttpException(request, response);
    }

    return JSON.parse(response.content) as TResource[];
  }
}
