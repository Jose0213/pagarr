import type { EpubPackage } from "../schema/epubPackage.js";

/** Ported from VersOne.Epub/EpubSchema.cs. */
export interface EpubSchema {
  package: EpubPackage;
  contentDirectoryPath: string;
}
