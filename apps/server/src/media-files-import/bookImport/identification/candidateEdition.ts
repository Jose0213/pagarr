import type { Edition } from "../../../books/index.js";
import type { BookFile } from "../../bookFile.js";

/** Ported from NzbDrone.Core/MediaFiles/BookImport/Identification/CandidateEdition.cs. */
export interface CandidateEdition {
  edition: Edition;
  existingFiles: BookFile[];
}

export function newCandidateEdition(
  edition: Edition,
  existingFiles: BookFile[] = []
): CandidateEdition {
  return { edition, existingFiles };
}
