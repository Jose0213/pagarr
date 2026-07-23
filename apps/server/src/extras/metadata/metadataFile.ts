import type { ExtraFile } from "../extraFile.js";
import { MetadataType } from "./metadataType.js";

/** Ported from NzbDrone.Core/Extras/Metadata/Files/MetadataFile.cs. Backing table: MetadataFiles. */
export interface MetadataFile extends ExtraFile {
  hash: string | null;
  consumer: string;
  type: MetadataType;
}

export function newMetadataFile(overrides: Partial<MetadataFile> = {}): MetadataFile {
  return {
    id: 0,
    authorId: 0,
    bookFileId: null,
    bookId: null,
    relativePath: "",
    added: "",
    lastUpdated: "",
    extension: "",
    hash: null,
    consumer: "",
    type: MetadataType.Unknown,
    ...overrides,
  };
}
