import type { Author } from "../../books/models.js";
import type { ValidationResult } from "../../indexers/IIndexerSettings.js";
import type { BookFile } from "../forwardRefs.js";
import type { ImageFileResult } from "./imageFileResult.js";
import type { MetadataFile } from "./metadataFile.js";
import type { MetadataFileResult } from "./metadataFileResult.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/IMetadata.cs +
 * NzbDrone.Core/ThingiProvider/IProvider.cs.
 *
 * FORWARD-REFERENCE NARROWING: `IMetadata : IProvider` -- `IProvider`
 * (ThingiProvider, not ported) contributes `Name`/`ConfigContract`/
 * `DefaultDefinitions`/`Definition`/`Test()`/`Message`/`RequestAction`,
 * which `MetadataBase<TSettings>` below implements directly (inlined, same
 * "IProvider members live on the concrete base" approach as
 * indexers/indexerBase.ts takes for `IIndexer : IProvider`).
 *
 * `ValidationResult`/`ValidationFailure` are the REAL types from
 * indexers/IIndexerSettings.ts (Phase 2, already merged) -- reused here
 * rather than redeclared, since they're already the narrowed stand-in for
 * ThingiProvider's `IProviderConfig.Validate()`/FluentValidation surface.
 */
export interface IMetadata {
  readonly name: string;
  getFilenameAfterMoveForBookFile(
    author: Author,
    bookFile: BookFile,
    metadataFile: MetadataFile
  ): string;
  getFilenameAfterMoveForBookPath(
    author: Author,
    bookPath: string,
    metadataFile: MetadataFile
  ): string;
  findMetadataFile(author: Author, path: string): MetadataFile | null;
  authorMetadata(author: Author): MetadataFileResult | null;
  bookMetadata(author: Author, bookFile: BookFile): MetadataFileResult | null;
  authorImages(author: Author): ImageFileResult[];
  bookImages(author: Author, bookFile: BookFile): ImageFileResult[];
  test(): ValidationResult;
}

/**
 * Ported from NzbDrone.Core/Extras/Metadata/MetadataBase.cs.
 *
 * C#'s two `GetFilenameAfterMove` overloads (one taking `BookFile`, one
 * taking a raw `bookPath` string) are ported as two distinctly-named
 * methods (`getFilenameAfterMoveForBookFile`/`getFilenameAfterMoveForBookPath`),
 * matching this repo's established no-C#-style-overloading convention (see
 * e.g. decision-engine/mediaFile.ts's `CustomFormatCalculationServiceLike`
 * doc comment for the same pattern).
 *
 * `Test()` returns an always-valid `ValidationResult` in the C# base
 * (`FluentValidation.Results.ValidationResult`'s parameterless ctor is
 * always-valid) -- ported the same way; concrete consumer subclasses never
 * override it in the real source either.
 */
export abstract class MetadataBase<TSettings> implements IMetadata {
  abstract readonly name: string;

  constructor(protected readonly settings: TSettings) {}

  test(): ValidationResult {
    return { isValid: true, hasWarnings: false, errors: [] };
  }

  /** Ported from MetadataBase.GetFilenameAfterMove(Author author, BookFile bookFile, MetadataFile metadataFile). */
  getFilenameAfterMoveForBookFile(
    author: Author,
    bookFile: BookFile,
    metadataFile: MetadataFile
  ): string {
    const existingFilename = joinPath(author.path, metadataFile.relativePath);
    const extension = getExtension(existingFilename).replace(/^\./, "");
    return changeExtension(bookFile.path, extension);
  }

  /** Ported from MetadataBase.GetFilenameAfterMove(Author author, string bookPath, MetadataFile metadataFile). */
  getFilenameAfterMoveForBookPath(
    author: Author,
    bookPath: string,
    metadataFile: MetadataFile
  ): string {
    const existingFilename = getFileName(metadataFile.relativePath);
    return joinPath(joinPath(author.path, bookPath), existingFilename);
  }

  abstract findMetadataFile(author: Author, path: string): MetadataFile | null;
  abstract authorMetadata(author: Author): MetadataFileResult | null;
  abstract bookMetadata(author: Author, bookFile: BookFile): MetadataFileResult | null;
  abstract authorImages(author: Author): ImageFileResult[];
  abstract bookImages(author: Author, bookFile: BookFile): ImageFileResult[];
}

/** Ported from `Path.GetExtension`. */
function getExtension(path: string): string {
  const base = getFileName(path);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(dotIndex) : "";
}

/** Ported from `Path.GetFileName`. */
function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

/** Ported from `Path.ChangeExtension`. */
function changeExtension(path: string, extension: string): string {
  const base = getFileName(path);
  const dotIndex = base.lastIndexOf(".");
  const withoutExt = dotIndex > 0 ? path.slice(0, path.length - (base.length - dotIndex)) : path;
  return extension ? `${withoutExt}.${extension}` : withoutExt;
}

/** Ported from `Path.Combine`, matching the local helper used across this module's other files. */
function joinPath(base: string, relative: string): string {
  if (base.endsWith("/") || base.endsWith("\\")) {
    return base + relative;
  }
  const sep = base.includes("\\") && !base.includes("/") ? "\\" : "/";
  return base + sep + relative;
}
