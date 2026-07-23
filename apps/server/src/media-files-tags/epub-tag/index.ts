/**
 * Barrel export for the EpubTag module. Ported from
 * NzbDrone.Core/MediaFiles/EpubTag/ (a vendored subset of the VersOne.Epub
 * library covering schema/metadata reading only -- see epubReader.ts's
 * header comment).
 */
export * from "./epubReader.js";
export * from "./entities/epubBook.js";
export * from "./entities/epubSchema.js";
export * from "./refEntities/epubBookRef.js";
export * from "./schema/epubMetadata.js";
export * from "./schema/epubPackage.js";
export * from "./schema/epubVersion.js";
export * from "./utils/zipPathUtils.js";
