import type { LocalEdition } from "../../../parser/model/localEdition.js";
import { Decision } from "../../../decision-engine/decision.js";
import type {
  IImportDecisionEngineSpecification,
  DownloadClientItemLike,
} from "../importDecisionEngineSpecification.js";
import type { RootFolderLookup } from "../importDecisionMaker.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Specifications/AuthorPathInRootFolderSpecification.cs. */
export class AuthorPathInRootFolderSpecification implements IImportDecisionEngineSpecification<LocalEdition> {
  constructor(private readonly rootFolderService: RootFolderLookup) {}

  isSatisfiedBy(item: LocalEdition, _downloadClientItem: DownloadClientItemLike | null): Decision {
    // Prevent imports to authors that are no longer inside a root folder Pagarr manages
    const author = item.edition?.book?.author;

    // a new author will have empty path, and will end up having path assigned based on file location
    const pathToCheck =
      author !== undefined && author.path.trim() !== ""
        ? author.path
        : parentPath(item.localBooks[0]!.path);

    if (this.rootFolderService.getBestRootFolder(pathToCheck) === undefined) {
      return Decision.reject(`Destination folder ${pathToCheck} is not in a Root Folder`);
    }

    return Decision.accept();
  }
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.GetParentPath`. */
function parentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx === -1 ? "" : normalized.substring(0, idx);
}
