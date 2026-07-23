import type { LocalBook } from "../../../parser/model/localBook.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";

/** Ported from the slice of `IConfigService` this specification reads. */
export interface FreeSpaceConfigLookup {
  skipFreeSpaceCheckWhenImporting: boolean;
  minimumFreeSpaceWhenImporting: number;
}

/** Ported from the slice of `IDiskProvider` this specification calls. */
export interface FreeSpaceDiskLookup {
  getAvailableSpace(path: string): number | null;
}

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/FreeSpaceSpecification.cs. */
export class FreeSpaceSpecification implements IImportDecisionEngineSpecification<LocalBook> {
  constructor(
    private readonly diskProvider: FreeSpaceDiskLookup,
    private readonly configService: FreeSpaceConfigLookup
  ) {}

  isSatisfiedBy(item: LocalBook, _downloadClientItem: DownloadClientItemLike | null): Decision {
    if (this.configService.skipFreeSpaceCheckWhenImporting) {
      return Decision.accept();
    }

    try {
      if (item.existingFile) {
        return Decision.accept();
      }

      const path = parentPath(item.author?.path ?? "");
      const freeSpace = this.diskProvider.getAvailableSpace(path);

      if (freeSpace === null) {
        return Decision.accept();
      }

      // Ported from `_configService.MinimumFreeSpaceWhenImporting.Megabytes()`
      // (Fluent.cs: `megabytes * 1024L * 1024L`).
      if (freeSpace < item.size + this.configService.minimumFreeSpaceWhenImporting * 1024 * 1024) {
        return Decision.reject("Not enough free space");
      }
    } catch {
      // Ported from the C# source's catch-all (DirectoryNotFoundException +
      // general Exception, both just logged): swallow and accept, matching
      // "never let a disk-probe failure block the whole import."
    }

    return Decision.accept();
  }
}

/** Ported from `System.IO.Directory.GetParent(path).FullName`. */
function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  return idx === -1 ? trimmed : trimmed.substring(0, idx);
}
