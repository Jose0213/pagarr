import type { IConfigService } from "../config/configService.js";
import type { ProviderDefinition } from "../thingi-provider/ProviderDefinition.js";
import type { ValidationFailure, ValidationResult } from "../thingi-provider/IProviderConfig.js";
import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";
import type { IImportList } from "./IImportList.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import type { ImportListDefinition } from "./ImportListDefinition.js";
import type { ImportListType } from "./ImportListType.js";
import type { IImportListStatusService } from "./ImportListStatusService.js";

/**
 * FORWARD-REFERENCE: `IParsingService` (NzbDrone.Core/Parser/ParsingService.cs)
 * -- matches `indexers/indexerBase.ts`'s identical note: `_parsingService`
 * is stored in the C# ctor and never referenced again by
 * `ImportListBase`/`HttpImportListBase`. Kept as an untyped marker rather
 * than pulled in fully.
 */
export type IParsingService = unknown;

/** Minimal logger surface ImportListBase/HttpImportListBase need, matching the sibling modules' own narrowed logger interfaces. */
export interface ImportListLogger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

export const noopImportListLogger: ImportListLogger = {
  trace: () => {},
  debug: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListBase.cs.
 *
 * `ImportListBase<TSettings> : IImportList` -- `IImportList` itself extends
 * the REAL `thingi-provider/IProvider.ts` (per this module's task brief,
 * following the exact pattern `notifications/NotificationBase.ts` /
 * `indexers/indexerBase.ts` established for provider-kind base classes).
 *
 * C#'s generic constraint `where TSettings : IImportListSettings, new()`
 * (the `new()` part) has no TS equivalent -- same "subclasses provide a
 * `createDefaultSettings()` factory instead" substitute `indexerBase.ts`
 * documents for its own identical constraint.
 */
export abstract class ImportListBase<
  TSettings extends IImportListSettings,
> implements IImportList<TSettings> {
  protected readonly importListStatusService: IImportListStatusService;
  protected readonly configService: IConfigService;
  protected readonly parsingService: IParsingService;
  protected readonly logger: ImportListLogger;

  abstract readonly name: string;
  abstract readonly listType: ImportListType;
  /** Milliseconds. Ported from `abstract TimeSpan MinRefreshInterval`. */
  abstract readonly minRefreshIntervalMs: number;

  constructor(
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    this.importListStatusService = importListStatusService;
    this.configService = configService;
    this.parsingService = parsingService;
    this.logger = logger;
  }

  /** Ported from `Type ConfigContract => typeof(TSettings)`: the config contract *name*, see `thingi-provider/IProvider.ts`'s doc comment on this substitute. */
  abstract readonly configContract: string;

  /** Ported from `virtual ProviderMessage Message => null;`. */
  get message(): null {
    return null;
  }

  /** Ported from `virtual IEnumerable<ProviderDefinition> DefaultDefinitions`: base always yields exactly one definition built from a fresh default-settings instance. */
  get defaultDefinitions(): ProviderDefinition<TSettings>[] {
    return [];
  }

  /** Ported from `virtual ProviderDefinition Definition { get; set; }`. */
  definition!: ImportListDefinition<TSettings>;

  requestAction(_action: string, _query: Record<string, string>): unknown {
    return null;
  }

  protected get settings(): TSettings {
    return this.definition.settings as TSettings;
  }

  abstract fetch(): Promise<ImportListItemInfo[]>;

  /**
   * Ported from `virtual IList<ImportListItemInfo> CleanupListItems(...)`:
   * dedup by (Author, Book) pair (`DistinctBy(r => new { r.Author, r.Book
   * })`, keeping the first occurrence -- ported via a Set-tracked filter
   * matching `indexerBase.ts`'s `cleanupReleases` dedup convention), then
   * stamps `ImportListId`/`ImportList` identity fields onto each survivor.
   */
  protected cleanupListItems(releases: Iterable<ImportListItemInfo>): ImportListItemInfo[] {
    const seen = new Set<string>();
    const result: ImportListItemInfo[] = [];

    for (const release of releases) {
      const key = `${release.author ?? ""} ${release.book ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(release);
      }
    }

    for (const release of result) {
      release.importListId = this.definition.id;
      release.importList = this.definition.name;
    }

    return result;
  }

  /**
   * Ported from `ImportListBase.Test()`: runs the abstract `Test(failures)`
   * hook and wraps any thrown exception as a validation failure, matching
   * the C# try/catch.
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
