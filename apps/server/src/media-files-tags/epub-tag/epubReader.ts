import { existsSync } from "node:fs";
import AdmZip from "adm-zip";
import { readSchema } from "./readers/schemaReader.js";
import { EpubBookRef } from "./refEntities/epubBookRef.js";

/**
 * Ported from VersOne.Epub/EpubReader.cs.
 *
 * Only `OpenBook`/`OpenBookAsync` are ported -- Readarr
 * (EbookTagService.cs's `ReadEpub`) exclusively calls the synchronous
 * `EpubReader.OpenBook`, never any of the "read the whole book including
 * content/images" APIs that live elsewhere in the real `VersOne.Epub`
 * package upstream (this vendored subset of the library only actually
 * ships the schema/metadata-reading slice to begin with -- see this
 * module's directory listing, which has no chapter/content readers at
 * all).
 *
 * C#'s `\\?\` long-path-prefix retry (`File.Exists` fails on paths over
 * MAX_PATH without it) is a Windows-specific `System.IO` workaround with no
 * meaning for Node's `fs` (which has no MAX_PATH limitation on any
 * platform Node runs on) -- dropped rather than ported, since it's a
 * .NET-runtime-specific workaround for a .NET-runtime-specific limitation,
 * not an observable behavior of the EPUB format or Readarr's logic.
 *
 * ZIP handling: .NET's `System.IO.Compression.ZipArchive` (`ZipFile.
 * OpenRead`) has no direct equivalent in Node's standard library. This
 * port uses `adm-zip` (added as this module's ZIP dependency), a
 * widely-used, actively maintained, MIT-licensed pure-JS ZIP reader with a
 * synchronous API (`new AdmZip(path)`, `.getEntry(name)`,
 * `.readAsText(entry)`) that maps directly onto the C# source's
 * open-then-`GetEntry`-then-`Open` control flow, unlike callback/stream-
 * based alternatives (e.g. `yauzl`) that would need a much larger
 * re-shaping of RootFilePathReader.ts/PackageReader.ts/SchemaReader.ts's
 * straight-line logic to adopt.
 *
 * `EpubBookRef` no longer holds a live zip handle in this port (see that
 * class's doc comment) -- the whole schema is read eagerly here instead,
 * so there is nothing left to keep open/dispose after `openBook()`
 * returns.
 */
export function openBook(filePath: string): EpubBookRef {
  if (!existsSync(filePath)) {
    throw new Error(`Specified epub file not found: ${filePath}`);
  }

  const epubArchive = new AdmZip(filePath);
  const result = new EpubBookRef();

  try {
    result.filePath = filePath;
    result.schema = readSchema(epubArchive);
    result.title = result.schema.package.metadata.titles[0] ?? "";
    result.authorList = result.schema.package.metadata.creators.map((creator) => creator.creator);
    result.author = result.authorList.join(", ");
    return result;
  } catch (e) {
    result.dispose();
    throw e;
  }
}
