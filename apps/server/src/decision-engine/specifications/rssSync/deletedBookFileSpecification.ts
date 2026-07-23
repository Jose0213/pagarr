import type { IConfigService } from "../../../config/configService.js";
import { Decision } from "../../decision.js";
import type { MediaFileServiceLike } from "../../mediaFile.js";
import { RejectionType } from "../../rejectionType.js";
import type { RemoteBook, SearchCriteriaBase } from "../../remoteBook.js";
import { SpecificationPriority } from "../../specificationPriority.js";
import type { IDecisionEngineSpecification } from "../decisionEngineSpecification.js";

/**
 * Forward-ref for the slice of NzbDrone.Common/Disk/IDiskProvider.cs this
 * spec needs. NOT reusing root-folders/disk-provider.ts's `IDiskProvider`
 * directly (it only ports `folderExists`/`folderWritable`/
 * `getAvailableSpace`/`getTotalSize` -- the slice RootFolderService needs,
 * per that file's own header comment -- not `fileExists`, which this spec
 * needs instead). A real shared `IDiskProvider` belongs to a future Common/
 * Disk module port; this is the minimal local stand-in until then.
 */
export interface DiskProviderLike {
  fileExists(path: string): boolean;
}

/** Ported from NzbDrone.Core/DecisionEngine/Specifications/RssSync/DeletedBookFileSpecification.cs. */
export class DeletedBookFileSpecification implements IDecisionEngineSpecification {
  readonly priority = SpecificationPriority.Disk;
  readonly type = RejectionType.Temporary;

  constructor(
    private readonly diskProvider: DiskProviderLike,
    private readonly configService: IConfigService,
    private readonly mediaFileService: MediaFileServiceLike
  ) {}

  isSatisfiedBy(subject: RemoteBook, searchCriteria: SearchCriteriaBase | null): Decision {
    if (!this.configService.autoUnmonitorPreviouslyDownloadedBooks) {
      return Decision.accept();
    }

    if (searchCriteria != null) {
      return Decision.accept();
    }

    const seen = new Set<number>();
    const missingBookFiles = subject.books
      .flatMap((v) => this.mediaFileService.getFilesByBook(v.id))
      .filter((v) => {
        if (seen.has(v.id)) {
          return false;
        }
        seen.add(v.id);
        return true;
      })
      .filter((v) => !this.diskProvider.fileExists(v.path));

    if (missingBookFiles.length > 0) {
      return Decision.reject("Author is not monitored");
    }

    return Decision.accept();
  }
}
