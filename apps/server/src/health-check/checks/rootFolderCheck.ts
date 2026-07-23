import { isPathRooted } from "../../root-folders/path-utils.js";
import { AuthorDeletedEvent, AuthorMovedEvent } from "../../books/events.js";
import { TrackImportedEvent, TrackImportFailedEvent } from "../../media-files-import/events.js";
import { checkOn, CheckOnCondition, type CheckOnEntry } from "../checkOnAttribute.js";
import {
  createHealthCheck,
  createOkHealthCheck,
  HealthCheckResult,
  type HealthCheck,
} from "../healthCheck.js";
import { HealthCheckBase } from "../healthCheckBase.js";
import type { ILocalizationService } from "../localizationService.js";
import type { ImportListFactoryLike } from "./importListRootFolderCheck.js";
import { formatMessage } from "./_shared.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/Checks/RootFolderCheck.cs.
 *
 * `IImportListFactory` reused from `importListRootFolderCheck.ts`'s own
 * `ImportListFactoryLike` narrowing (both checks need the exact same
 * `all(): { rootFolderPath }[]` slice) rather than re-declaring a second
 * structurally-identical forward-ref.
 */
export const CHECK_ON: CheckOnEntry[] = [
  checkOn(AuthorDeletedEvent, CheckOnCondition.Always),
  checkOn(AuthorMovedEvent, CheckOnCondition.Always),
  checkOn(TrackImportedEvent, CheckOnCondition.FailedOnly),
  checkOn(TrackImportFailedEvent, CheckOnCondition.SuccessfulOnly),
];

export interface RootFolderCheckAuthorService {
  /** Ported from `IAuthorService.AllAuthorPaths()` -- real, `books/authorService.ts`. */
  allAuthorPaths(): Map<number, string>;
}

export interface RootFolderCheckRootFolderService {
  getBestRootFolderPath(path: string): string;
}

export interface RootFolderCheckDiskProvider {
  folderExists(path: string): boolean;
}

export class RootFolderCheck extends HealthCheckBase {
  constructor(
    private readonly authorService: RootFolderCheckAuthorService,
    private readonly importListFactory: ImportListFactoryLike,
    private readonly diskProvider: RootFolderCheckDiskProvider,
    private readonly rootFolderService: RootFolderCheckRootFolderService,
    localizationService: ILocalizationService
  ) {
    super(localizationService);
  }

  check(): HealthCheck {
    const rootFolders = [
      ...new Set(
        [...this.authorService.allAuthorPaths().values()].map((path) =>
          this.rootFolderService.getBestRootFolderPath(path)
        )
      ),
    ];

    const missingRootFolders = rootFolders.filter(
      (s) => !isPathRooted(s) || !this.diskProvider.folderExists(s)
    );

    missingRootFolders.push(
      ...new Set(
        this.importListFactory
          .all()
          .map((s) => s.rootFolderPath)
          .filter((s, index, all) => all.indexOf(s) === index && !this.diskProvider.folderExists(s))
      )
    );

    const distinctMissing = [...new Set(missingRootFolders)];

    if (distinctMissing.length > 0) {
      if (distinctMissing.length === 1) {
        return createHealthCheck(
          RootFolderCheck,
          HealthCheckResult.Error,
          formatMessage(
            this.localizationService.getLocalizedString("RootFolderCheckSingleMessage"),
            distinctMissing[0]
          ),
          "#missing-root-folder"
        );
      }

      const message = formatMessage(
        this.localizationService.getLocalizedString("RootFolderCheckMultipleMessage"),
        distinctMissing.join(" | ")
      );
      return createHealthCheck(
        RootFolderCheck,
        HealthCheckResult.Error,
        message,
        "#missing-root-folder"
      );
    }

    return createOkHealthCheck(RootFolderCheck);
  }
}
