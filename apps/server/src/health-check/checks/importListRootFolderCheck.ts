import { AuthorDeletedEvent, AuthorMovedEvent } from "../../books/events.js";
import { TrackImportedEvent, TrackImportFailedEvent } from "../../media-files-import/events.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import { BookImportedEvent } from "./bookImportedEvent.js";
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
 * Ported from NzbDrone.Core/HealthCheck/Checks/ImportListRootFolderCheck.cs.
 *
 * FORWARD-REFERENCE: `NzbDrone.Core.ImportLists` (`IImportListFactory`,
 * `ImportListDefinition`) has not been ported by any prior phase (confirmed
 * -- no `import-lists/` directory exists under `apps/server/src`, and
 * PORT_PLAN.md doesn't list it as landed). Narrowed to the two members this
 * check actually reads: `All()` and each definition's `RootFolderPath`/`Name`.
 *
 * `[CheckOn(typeof(BookImportedEvent), CheckOnCondition.FailedOnly)]` IS
 * reproduced: `BookImportedEvent` is a real C# class
 * (`NzbDrone.Core/MediaFiles/Events/BookImportedEvent.cs`), just not yet
 * ported by `media-files-import` (that module's own
 * `bookImport/importApprovedBooks.ts` doc comment documents this exact
 * gap). See `./bookImportedEvent.ts` for this port's local definition of
 * that same event shape and the reconciliation note for when
 * `media-files-import` eventually publishes it for real.
 * `TrackImportedEvent`/`TrackImportFailedEvent` (both real, already-ported
 * `IEvent`s) are also reproduced.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(AuthorDeletedEvent, CheckOnCondition.Always),
  checkOn(AuthorMovedEvent, CheckOnCondition.Always),
  checkOn(BookImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportFailedEvent, CheckOnCondition.SuccessfulOnly),
];

/** FORWARD-REFERENCE narrowing of `IImportListFactory`/`ImportListDefinition` -- see module doc comment. */
export interface ImportListDefinitionLike {
  name: string;
  rootFolderPath: string;
}

export interface ImportListFactoryLike {
  all(): ImportListDefinitionLike[];
}

export interface DiskProviderLike {
  folderExists(path: string): boolean;
}

export class ImportListRootFolderCheck extends HealthCheckBase {
  constructor(
    private readonly importListFactory: ImportListFactoryLike,
    private readonly diskProvider: DiskProviderLike,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const importLists = this.importListFactory.all();
    const missingRootFolders = new Map<string, ImportListDefinitionLike[]>();

    for (const importList of importLists) {
      const rootFolderPath = importList.rootFolderPath;

      const existing = missingRootFolders.get(rootFolderPath);
      if (existing) {
        existing.push(importList);
        continue;
      }

      if (!this.diskProvider.folderExists(rootFolderPath)) {
        missingRootFolders.set(rootFolderPath, [importList]);
      }
    }

    if (missingRootFolders.size > 0) {
      if (missingRootFolders.size === 1) {
        const [key, value] = [...missingRootFolders.entries()][0]!;
        return createHealthCheck(
          ImportListRootFolderCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("ImportListMissingRoot"),
            formatRootFolder(key, value)
          ),
          "#import-list-missing-root-folder"
        );
      }

      const message = formatMessage(
        this.localizationService.getLocalizedString("ImportListMultipleMissingRoots"),
        [...missingRootFolders.entries()]
          .map(([key, value]) => formatRootFolder(key, value))
          .join(" | ")
      );
      return createHealthCheck(
        ImportListRootFolderCheck,
        HealthCheckResult.Error,
        message,
        "#import_list_missing_root_folder"
      );
    }

    return createOkHealthCheck(ImportListRootFolderCheck);
  }
}

function formatRootFolder(rootFolderPath: string, importLists: ImportListDefinitionLike[]): string {
  return `${rootFolderPath} (${importLists.map((l) => l.name).join(", ")})`;
}
