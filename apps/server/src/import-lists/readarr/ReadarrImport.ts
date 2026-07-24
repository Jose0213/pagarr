import type { IConfigService } from "../../config/configService.js";
import type { ImportListItemInfo } from "../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../parser/model/importListItemInfo.js";
import { BadRequestException } from "../../exceptions/BadRequestException.js";
import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import {
  ImportListBase,
  type IParsingService,
  type ImportListLogger,
  noopImportListLogger,
} from "../ImportListBase.js";
import { ImportListType } from "../ImportListType.js";
import type { IImportListStatusService } from "../ImportListStatusService.js";
import type { IReadarrV1Proxy } from "./ReadarrV1Proxy.js";
import type { ReadarrSettings } from "./ReadarrSetting.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Readarr/ReadarrImport.cs.
 * LIVE-SERVICE STATUS: see `ReadarrSetting.ts`'s doc comment.
 */
export class ReadarrImport extends ImportListBase<ReadarrSettings> {
  private readonly readarrV1Proxy: IReadarrV1Proxy;

  constructor(
    readarrV1Proxy: IReadarrV1Proxy,
    importListStatusService: IImportListStatusService,
    configService: IConfigService,
    parsingService: IParsingService,
    logger: ImportListLogger = noopImportListLogger
  ) {
    super(importListStatusService, configService, parsingService, logger);
    this.readarrV1Proxy = readarrV1Proxy;
  }

  override readonly name = "Readarr";
  override readonly configContract = "ReadarrSettings";
  override readonly listType = ImportListType.Program;
  override readonly minRefreshIntervalMs = 15 * 60 * 1000;

  override async fetch(): Promise<ImportListItemInfo[]> {
    const authorsAndBooks: ImportListItemInfo[] = [];

    try {
      const remoteBooks = await this.readarrV1Proxy.getBooks(this.settings);
      const remoteAuthors = await this.readarrV1Proxy.getAuthors(this.settings);

      const authorDict = new Map(remoteAuthors.map((a) => [a.id, a]));

      for (const remoteBook of remoteBooks) {
        // FAITHFULLY PRESERVED: the real C# does an unguarded
        // `authorDict[remoteBook.AuthorId]` dictionary index here, which
        // throws `KeyNotFoundException` if a book's AuthorId doesn't match
        // any author in the same response (shouldn't happen against a
        // well-formed Readarr.Api.V1 response, but if it did, the whole
        // `Fetch()` loop aborts -- not just that one book -- caught by the
        // outer `catch` below, which logs and records a failure for the
        // ENTIRE sync, not a per-item skip). Reproduced the same
        // whole-loop-aborting behavior via an explicit throw rather than a
        // silent `continue`, which would diverge from the real fault
        // blast-radius.
        const remoteAuthor = authorDict.get(remoteBook.authorId);
        if (remoteAuthor === undefined) {
          throw new Error(`Key not found: ${remoteBook.authorId}`);
        }

        if (
          this.settings.profileIds.length > 0 &&
          !this.settings.profileIds.includes(remoteAuthor.qualityProfileId)
        ) {
          continue;
        }

        if (
          this.settings.tagIds.length > 0 &&
          !this.settings.tagIds.some((x) => remoteAuthor.tags.includes(x))
        ) {
          continue;
        }

        if (
          this.settings.rootFolderPaths.length > 0 &&
          !this.settings.rootFolderPaths.some((rootFolderPath) =>
            containsIgnoreCase(remoteAuthor.rootFolderPath, rootFolderPath)
          )
        ) {
          continue;
        }

        if (!remoteBook.monitored || !remoteAuthor.monitored) {
          continue;
        }

        const item = newImportListItemInfo();
        item.bookGoodreadsId = remoteBook.foreignBookId;
        item.book = remoteBook.title;
        item.editionGoodreadsId = remoteBook.foreignEditionId;
        item.author = remoteAuthor.authorName;
        item.authorGoodreadsId = remoteAuthor.foreignAuthorId;
        authorsAndBooks.push(item);
      }

      this.importListStatusService.recordSuccess(this.definition.id);
    } catch {
      this.logger.warn("List Import Sync Task Failed for List [%s]", this.definition.name);
      this.importListStatusService.recordFailure(this.definition.id);
    }

    return this.cleanupListItems(authorsAndBooks);
  }

  override async requestAction(action: string, _query: Record<string, string>): Promise<unknown> {
    // Return early if there is not an API key
    if (!this.settings.apiKey || this.settings.apiKey.trim() === "") {
      return { devices: [] };
    }

    const validation = this.settings.validate();
    const apiKeyFailure = validation.errors.find((e) => e.propertyName === "apiKey");
    if (apiKeyFailure) {
      throw new BadRequestException(apiKeyFailure.errorMessage);
    }

    if (action === "getProfiles") {
      const profiles = await this.readarrV1Proxy.getProfiles(this.settings);

      return {
        options: [...profiles]
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
          .map((d) => ({ Value: d.id, Name: d.name })),
      };
    }

    if (action === "getTags") {
      const tags = await this.readarrV1Proxy.getTags(this.settings);

      return {
        options: [...tags]
          .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
          .map((d) => ({ Value: d.id, Name: d.label })),
      };
    }

    if (action === "getRootFolders") {
      const rootFolders = await this.readarrV1Proxy.getRootFolders(this.settings);

      return {
        options: [...rootFolders]
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }))
          .map((d) => ({ value: d.path, name: d.path })),
      };
    }

    return {};
  }

  protected override async testConnection(failures: ValidationFailure[]): Promise<void> {
    const failure = await this.readarrV1Proxy.test(this.settings);
    if (failure !== null) {
      failures.push(failure);
    }
  }
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.ContainsIgnoreCase`. */
function containsIgnoreCase(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
