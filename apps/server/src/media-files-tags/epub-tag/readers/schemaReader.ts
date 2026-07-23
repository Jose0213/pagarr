import AdmZip from "adm-zip";
import { getRootFilePath } from "./rootFilePathReader.js";
import { readPackage } from "./packageReader.js";
import { getDirectoryPath } from "../utils/zipPathUtils.js";
import type { EpubSchema } from "../entities/epubSchema.js";

/**
 * Ported from VersOne.Epub.Internal/SchemaReader.cs.
 *
 * The C# original is async (`Task<EpubSchema> ReadSchemaAsync(ZipArchive)`)
 * because `System.IO.Compression.ZipArchiveEntry.Open()` + `XDocument`
 * loading go through `Stream`-based async APIs. `adm-zip` (this module's
 * chosen ZIP dependency -- see epubReader.ts's header comment) is fully
 * synchronous, and EPUB metadata files (`container.xml`, the OPF root file)
 * are always small (single-digit KB), so this port is synchronous
 * throughout rather than wrapping trivial in-memory buffer reads in
 * `Promise`s purely to mirror the C# signature -- no observable behavior
 * difference for callers, which already only ever `await`/block on the
 * whole read as one unit.
 */
export function readSchema(epubArchive: AdmZip): EpubSchema {
  const rootFilePath = getRootFilePath(readZipEntryText(epubArchive, "META-INF/container.xml"));
  const contentDirectoryPath = getDirectoryPath(rootFilePath);
  const packageResult = readPackage(readZipEntryText(epubArchive, rootFilePath));

  return {
    contentDirectoryPath,
    package: packageResult,
  };
}

function readZipEntryText(epubArchive: AdmZip, entryPath: string): string {
  const entry = epubArchive.getEntry(entryPath);
  if (!entry) {
    throw new Error(`EPUB parsing error: ${entryPath} file not found in archive.`);
  }

  return epubArchive.readAsText(entry);
}
