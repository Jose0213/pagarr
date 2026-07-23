import type { IConfigService } from "../config/configService.js";
import { HttpException } from "../http/HttpException.js";
import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { IIndexer } from "../indexers/IIndexer.js";
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../indexers/IIndexerSettings.js";
import type { DownloadClientDefinition } from "./DownloadClientDefinition.js";
import type { DownloadClientInfo } from "./DownloadClientInfo.js";
import type { DownloadClientItem } from "./DownloadClientItem.js";
import type { IDiskProviderLike } from "./IDiskProviderLike.js";
import type { IDownloadClient } from "./IDownloadClient.js";
import type { IRemotePathMappingService } from "./RemotePathMappingService.js";
import type { RemoteBookLike } from "./RemoteBookLike.js";

/** Minimal logger surface DownloadClientBase and subclasses need. */
export interface DownloadClientLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const noopDownloadClientLogger: DownloadClientLogger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Ported from the Polly `ResiliencePipelineBuilder<HttpResponse>` retry
 * strategy declared on `DownloadClientBase<TSettings>.RetryStrategy`:
 * up to 2 retries (3 attempts total) on a 5xx response, a 408 response, or a
 * thrown `HttpException` wrapping a 5xx response, with an exponential
 * backoff (base 3s) + jitter between attempts. Ported as a plain async
 * helper rather than pulling in a full resilience-pipeline library, since
 * this is the only retry policy this module needs.
 *
 * Node/undici has no equivalent of .NET's `WebExceptionStatus`-level
 * distinction the C# `ShouldHandle` predicate doesn't even use here (it only
 * inspects `HttpResponse`/`HttpException`), so no behavior is lost by
 * porting directly against this repo's own `HttpException`/`HttpResponse`
 * types.
 */
export async function withDownloadRetryStrategy<T extends { statusCode: number }>(
  execute: () => Promise<T>,
  onRetry: (attempt: number, delayMs: number, error: unknown, result: T | null) => void
): Promise<T> {
  const maxRetryAttempts = 2;
  const baseDelayMs = 3000;

  let attempt = 0;

  for (;;) {
    try {
      const result = await execute();

      const shouldRetry = result.statusCode >= 500 || result.statusCode === 408;
      if (!shouldRetry || attempt >= maxRetryAttempts) {
        return result;
      }

      attempt++;
      const delayMs = backoffDelayMs(baseDelayMs, attempt);
      onRetry(attempt, delayMs, null, result);
      await sleep(delayMs);
    } catch (ex) {
      const isRetryableHttpError = ex instanceof HttpException && ex.response.statusCode >= 500;

      if (!isRetryableHttpError || attempt >= maxRetryAttempts) {
        throw ex;
      }

      attempt++;
      const delayMs = backoffDelayMs(baseDelayMs, attempt);
      onRetry(attempt, delayMs, ex, null);
      await sleep(delayMs);
    }
  }
}

/** Exponential backoff with +/-20% jitter, matching Polly's `BackoffType.Exponential` + `UseJitter = true`. */
function backoffDelayMs(baseDelayMs: number, attempt: number): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitterFactor = 0.8 + Math.random() * 0.4;
  return Math.round(exponential * jitterFactor);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ported from NzbDrone.Core/Download/DownloadClientBase.cs.
 *
 * FORWARD-REFERENCE NARROWING: the C# base's `Test()` returns a
 * `FluentValidation.Results.ValidationResult`; this port reuses
 * `indexers/IIndexerSettings.ts`'s `ValidationResult`/`ValidationFailure`
 * shapes (same precedent as `DownloadClientDefinition.ts` reusing
 * `IProviderConfig` from that same file -- `ThingiProvider`-level
 * validation contracts, not Indexers-owned, but Indexers defined them
 * first).
 */
export abstract class DownloadClientBase<
  TSettings extends IProviderConfig,
> implements IDownloadClient {
  protected readonly configService: IConfigService;
  protected readonly diskProvider: IDiskProviderLike;
  protected readonly remotePathMappingService: IRemotePathMappingService;
  protected readonly logger: DownloadClientLogger;

  abstract readonly name: string;
  abstract readonly protocol: DownloadProtocol;

  /** Ported from DownloadClientBase.Definition (settable, matches C#'s `virtual ... { get; set; }`). */
  definition!: DownloadClientDefinition;

  constructor(
    configService: IConfigService,
    diskProvider: IDiskProviderLike,
    remotePathMappingService: IRemotePathMappingService,
    logger: DownloadClientLogger = noopDownloadClientLogger
  ) {
    this.configService = configService;
    this.diskProvider = diskProvider;
    this.remotePathMappingService = remotePathMappingService;
    this.logger = logger;
  }

  toString(): string {
    return this.constructor.name;
  }

  protected get settings(): TSettings {
    return this.definition.settings as TSettings;
  }

  abstract download(remoteBook: RemoteBookLike, indexer: IIndexer | null): Promise<string | null>;
  abstract getItems(): Promise<DownloadClientItem[]> | DownloadClientItem[];

  /** Ported from DownloadClientBase.GetImportItem (base just returns the item unchanged). */
  getImportItem(
    item: DownloadClientItem,
    _previousImportAttempt: DownloadClientItem | null
  ): Promise<DownloadClientItem> | DownloadClientItem {
    return item;
  }

  abstract removeItem(item: DownloadClientItem, deleteData: boolean): Promise<void> | void;
  abstract getStatus(): Promise<DownloadClientInfo> | DownloadClientInfo;

  /**
   * Ported from DownloadClientBase.DeleteItemData(). C#'s `_diskProvider`
   * surface (`FolderExists`/`DeleteFolder`/`FileExists`/`DeleteFile`) is
   * narrowed on `IDiskProviderLike` to exactly what this method (and
   * Blackhole's `RemoveItem`) needs -- see that file's doc comment.
   */
  protected async deleteItemData(item: DownloadClientItem | null): Promise<void> {
    if (item == null) {
      return;
    }

    if (item.outputPath.isEmpty) {
      this.logger.trace("[%s] Doesn't have an outputPath, skipping delete data.", item.title);
      return;
    }

    try {
      if (await this.diskProvider.folderExists(item.outputPath.fullPath)) {
        this.logger.debug("[%s] Deleting folder '%s'.", item.title, item.outputPath.toString());
        await this.diskProvider.deleteFolder(item.outputPath.fullPath, true);
      } else if (await this.diskProvider.fileExists(item.outputPath.fullPath)) {
        this.logger.debug("[%s] Deleting file '%s'.", item.title, item.outputPath.toString());
        await this.diskProvider.deleteFile(item.outputPath.fullPath);
      } else {
        this.logger.trace(
          "[%s] File or folder '%s' doesn't exist, skipping cleanup.",
          item.title,
          item.outputPath.toString()
        );
      }
    } catch (ex) {
      this.logger.warn(
        "[%s] Error occurred while trying to delete data from '%s'.",
        item.title,
        item.outputPath.toString(),
        ex
      );
    }
  }

  /**
   * Ported from DownloadClientBase.Test(): runs the abstract `Test(failures)`
   * hook and wraps any thrown exception as a validation failure, matching
   * the C# try/catch.
   */
  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    try {
      await this.testConnection(failures);
    } catch (ex) {
      this.logger.error("Test aborted due to exception", ex);
      failures.push({
        propertyName: "",
        errorMessage: "Test was aborted due to an error: " + errorMessage(ex),
      });
    }

    return {
      isValid: !failures.some((f) => !f.isWarning),
      hasWarnings: failures.some((f) => f.isWarning),
      errors: failures,
    };
  }

  protected abstract testConnection(failures: ValidationFailure[]): Promise<void>;

  /**
   * Ported from DownloadClientBase.TestFolder(folder, propertyName, mustBeWritable = true).
   */
  protected async testFolder(
    folder: string,
    propertyName: string,
    mustBeWritable = true
  ): Promise<ValidationFailure | null> {
    if (!(await this.diskProvider.folderExists(folder))) {
      return {
        propertyName,
        errorMessage: "Folder does not exist",
        detailedDescription:
          "The folder you specified does not exist or is inaccessible. Please verify the folder permissions for the user account running Pagarr.",
      };
    }

    if (mustBeWritable && !(await this.diskProvider.folderWritable(folder))) {
      this.logger.error("Folder '%s' is not writable.", folder);
      return {
        propertyName,
        errorMessage: "Unable to write to folder",
        detailedDescription:
          "The folder you specified is not writable. Please verify the folder permissions for the user account running Pagarr.",
      };
    }

    return null;
  }

  /** Ported from DownloadClientBase.MarkItemAsImported (base throws NotSupportedException). */
  markItemAsImported(_downloadClientItem: DownloadClientItem): Promise<void> | void {
    throw new Error(this.name + " does not support marking items as imported");
  }

  requestAction(_action: string, _query: Record<string, string>): unknown {
    return null;
  }
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}
