import type { AuthorService } from "../../books/authorService.js";
import { ExtraFileService, type IExtraFileService } from "../extraFileService.js";
import type { IMetadataFileRepository } from "./metadataFileRepository.js";
import type { RecycleBinProviderLike } from "../forwardRefs.js";
import type { ExtraFileServiceOptions } from "../extraFileService.js";
import type { MetadataFile } from "./metadataFile.js";

/** Ported from NzbDrone.Core/Extras/Metadata/Files/MetadataFileService.cs. */
export type IMetadataFileService = IExtraFileService<MetadataFile>;

export class MetadataFileService
  extends ExtraFileService<MetadataFile>
  implements IMetadataFileService
{
  constructor(
    repository: IMetadataFileRepository,
    authorService: AuthorService,
    recycleBinProvider: RecycleBinProviderLike,
    options: ExtraFileServiceOptions = {}
  ) {
    super(repository, authorService, recycleBinProvider, options);
  }
}
