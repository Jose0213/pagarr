import type { IConfigService } from "../config/configService.js";
import type { DownloadProtocol } from "./DownloadProtocol.js";
import type { IIndexer } from "./IIndexer.js";
import type { IndexerDefinition } from "./IndexerDefinition.js";
import type { IProviderConfig, ValidationFailure, ValidationResult } from "./IIndexerSettings.js";
import type { ReleaseInfo } from "./releaseInfo.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "./searchCriteria.js";
import type { IIndexerStatusService } from "./IndexerStatusService.js";

/**
 * FORWARD-REFERENCE: `IParsingService` (NzbDrone.Core/Parser/ParsingService.cs)
 * is never actually called by anything in IndexerBase.cs/HttpIndexerBase.cs
 * (grepped: `_parsingService` is stored in the ctor and never referenced
 * again in either file) -- it's plumbed through purely for subclasses in
 * later-phase modules. Kept as an untyped marker here rather than pulled in
 * fully, matching this module's other narrow forward-references.
 */
export type IParsingService = unknown;

/** Minimal logger surface IndexerBase/HttpIndexerBase need. */
export interface IndexerLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const noopIndexerLogger: IndexerLogger = {
  trace: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Ported from NzbDrone.Core/Indexers/IndexerBase.cs. C#'s
 * `IndexerBase<TSettings>` generic constrains `TSettings : IIndexerSettings,
 * new()`; TS abstract classes can't express the `new()` constructor
 * constraint the same way; subclasses instead provide a
 * `createDefaultSettings()` factory (used in place of `new TSettings()`)
 * wherever the C# relied on that constraint (see `defaultDefinitions`
 * below).
 */
export abstract class IndexerBase<TSettings extends IProviderConfig> implements IIndexer {
  protected readonly indexerStatusService: IIndexerStatusService;
  protected readonly configService: IConfigService;
  protected readonly parsingService: IParsingService;
  protected readonly logger: IndexerLogger;

  abstract readonly name: string;
  abstract readonly protocol: DownloadProtocol;

  abstract readonly supportsRss: boolean;
  abstract readonly supportsSearch: boolean;

  /** Ported from IndexerBase.Definition (settable, matches C#'s `virtual ... { get; set; }`). */
  definition!: IndexerDefinition;

  constructor(
    indexerStatusService: IIndexerStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: IndexerLogger = noopIndexerLogger
  ) {
    this.indexerStatusService = indexerStatusService;
    this.configService = configService;
    this.parsingService = parsingService;
    this.logger = logger;
  }

  /** Ported from IndexerBase.Message (always null in the base). */
  get message(): null {
    return null;
  }

  protected get settings(): TSettings {
    return this.definition.settings as TSettings;
  }

  abstract fetchRecent(): Promise<ReleaseInfo[]>;
  abstract fetch(searchCriteria: BookSearchCriteria): Promise<ReleaseInfo[]>;
  abstract fetch(searchCriteria: AuthorSearchCriteria): Promise<ReleaseInfo[]>;
  abstract getDownloadRequest(link: string): import("../http/HttpRequest.js").HttpRequest;

  requestAction(_action: string, _query: Record<string, string>): unknown {
    return null;
  }

  /**
   * Ported from IndexerBase.CleanupReleases(IEnumerable<ReleaseInfo>): dedup
   * by Guid (`DistinctBy`, keeping first occurrence -- matched here via a
   * Set-tracked filter) then stamp indexer identity fields onto each
   * surviving release.
   */
  protected cleanupReleases(releases: Iterable<ReleaseInfo>): ReleaseInfo[] {
    const seen = new Set<string>();
    const result: ReleaseInfo[] = [];

    for (const release of releases) {
      if (!seen.has(release.guid)) {
        seen.add(release.guid);
        result.push(release);
      }
    }

    for (const release of result) {
      release.indexerId = this.definition.id;
      release.indexer = this.definition.name;
      release.downloadProtocol = this.protocol;
      release.indexerPriority = this.definition.priority;
    }

    return result;
  }

  /**
   * Ported from IndexerBase.Test(): runs the abstract `Test(failures)` hook
   * and wraps any thrown exception as a validation failure, matching the
   * C# try/catch around `Test(failures).GetAwaiter().GetResult()`.
   */
  async test(): Promise<ValidationResult> {
    const failures: ValidationFailure[] = [];

    try {
      await this.testConnection(failures);
    } catch (ex) {
      this.logger.error("Test aborted due to exception: %s", ex);
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

  toString(): string {
    return this.definition.name;
  }
}

function errorMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}
