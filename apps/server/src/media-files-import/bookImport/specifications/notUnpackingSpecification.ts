import type { LocalBook } from "../../../parser/model/localBook.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";

/** Ported from the slice of `IConfigService` this specification reads. */
export interface NotUnpackingConfigLookup {
  downloadClientWorkingFolders: string;
}

/** Ported from the slice of `IDiskProvider` this specification calls. */
export interface NotUnpackingDiskLookup {
  fileGetLastWrite(path: string): string;
}

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/NotUnpackingSpecification.cs.
 * `OsInfo.IsNotWindows` is a real runtime OS check in C#; ported here via
 * Node's `process.platform`, matching how the rest of this port handles
 * platform-conditional behavior (no forward-reference needed, this is a
 * Node built-in).
 */
export class NotUnpackingSpecification implements IImportDecisionEngineSpecification<LocalBook> {
  constructor(
    private readonly diskProvider: NotUnpackingDiskLookup,
    private readonly configService: NotUnpackingConfigLookup
  ) {}

  isSatisfiedBy(item: LocalBook, _downloadClientItem: DownloadClientItemLike | null): Decision {
    if (item.existingFile) {
      return Decision.accept();
    }

    for (const workingFolder of this.configService.downloadClientWorkingFolders.split("|")) {
      let parent = parentDir(item.path);

      while (parent !== null) {
        if (baseName(parent).startsWith(workingFolder)) {
          if (process.platform !== "win32") {
            return Decision.reject("File is still being unpacked");
          }

          const lastWrite = new Date(this.diskProvider.fileGetLastWrite(item.path)).getTime();
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

          if (lastWrite > fiveMinutesAgo) {
            return Decision.reject("File is still being unpacked");
          }
        }

        parent = parentDir(parent);
      }
    }

    return Decision.accept();
  }
}

/** Ported from `System.IO.Directory.GetParent(path)`: returns null once at the root, matching C#'s null-terminated parent-walk loop. */
function parentDir(path: string): string | null {
  const normalized = path.replace(/\\/g, "/");
  const trimmed = normalized.replace(/\/+$/, "");
  const idx = trimmed.lastIndexOf("/");
  if (idx <= 0) {
    return idx === -1 ? null : trimmed.substring(0, 1) || null;
  }
  return trimmed.substring(0, idx);
}

/** Ported from `DirectoryInfo.Name`. */
function baseName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? normalized : normalized.substring(idx + 1);
}
