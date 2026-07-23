import type { EpubSchema } from "./epubSchema.js";

/**
 * Ported from VersOne.Epub/EpubBook.cs. Unlike EpubBookRef.cs (its
 * lazy/streaming counterpart), nothing in Readarr actually constructs an
 * `EpubBook` -- `EbookTagService.ReadEpub` exclusively calls
 * `EpubReader.OpenBook` (-> `EpubBookRef`). Ported anyway for structural
 * completeness/fidelity with the source module.
 */
export interface EpubBook {
  filePath: string | null;
  title: string;
  author: string;
  authorList: string[];
  schema: EpubSchema | null;
}
