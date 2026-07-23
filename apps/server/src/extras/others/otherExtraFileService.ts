import type { AuthorService } from "../../books/authorService.js";
import {
  ExtraFileService,
  type IExtraFileService,
  type ExtraFileServiceOptions,
} from "../extraFileService.js";
import type { IOtherExtraFileRepository } from "./otherExtraFileRepository.js";
import type { RecycleBinProviderLike } from "../forwardRefs.js";
import type { OtherExtraFile } from "./otherExtraFile.js";

/** Ported from NzbDrone.Core/Extras/Others/OtherExtraFileService.cs. */
export type IOtherExtraFileService = IExtraFileService<OtherExtraFile>;

export class OtherExtraFileService
  extends ExtraFileService<OtherExtraFile>
  implements IOtherExtraFileService
{
  constructor(
    repository: IOtherExtraFileRepository,
    authorService: AuthorService,
    recycleBinProvider: RecycleBinProviderLike,
    options: ExtraFileServiceOptions = {}
  ) {
    super(repository, authorService, recycleBinProvider, options);
  }
}
