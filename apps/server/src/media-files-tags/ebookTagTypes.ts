/**
 * Forward-references for ebookTagService.ts.
 *
 * `NzbDrone.Core/Books/Calibre/*` (`ICalibreProxy`, `CalibreBook`,
 * `CalibreSettings`, the `CanonicalizeLanguage()` extension method) is a
 * separate, entirely un-ported module (not in this worktree's scope, and
 * not part of any Phase 0-2 module already merged either) -- EBookTagService.cs
 * only ever *calls into* it (`_calibre.SetFields(...)`, `_calibre.GetBooks(...)`,
 * `edition.Language.CanonicalizeLanguage()`), it never implements any of
 * Calibre's own logic. Rather than reimplement Calibre's HTTP proxy or its
 * translated-from-Python language-canonicalization table here (which would
 * not be a "MediaFiles/Tags" concern at all), this module defines the
 * minimal local interfaces EbookTagService actually calls, matching the
 * established forward-reference pattern (see
 * `apps/server/src/decision-engine/mediaFile.ts`'s header comment and
 * `apps/server/src/parser/model/remoteBook.ts`'s header comment for the
 * general approach), and takes `canonicalizeLanguage` as an injected
 * function rather than inlining Calibre's algorithm.
 *
 * `CalibreSettings` (the JSON-embedded settings blob) is NOT
 * forward-referenced here -- it's already the real ported type from
 * `apps/server/src/root-folders/root-folder.ts` (Phase 1, landed), reused
 * directly.
 */

import type { CalibreSettings } from "../root-folders/root-folder.js";

/** Forward-ref for the slice of NzbDrone.Core/Books/Calibre/CalibreBook.cs this module needs. */
export interface CalibreBook {
  id: number;
  title: string;
  authors: string[];
  authorSort: string | null;
  pubDate: string | null;
  publisher: string | null;
  languages: string[];
  tags: string[];
  comments: string | null;
  rating: number;
  identifiers: Record<string, string | null>;
  series: string | null;
  position: number | null;
}

/**
 * Forward-ref for the slice of NzbDrone.Core/Books/Calibre/ICalibreProxy.cs
 * this module needs (`SetFields`, `GetBooks`) -- the other real
 * `ICalibreProxy` members (`Test`, `GetLibraries`) aren't called by
 * EbookTagService.cs.
 */
export interface CalibreProxyLike {
  setFields(
    file: { calibreId: number; path: string },
    settings: CalibreSettings | null,
    updateCover: boolean,
    embedMetadata: boolean
  ): void;
  getBooks(calibreIds: number[], settings: CalibreSettings | null): CalibreBook[];
}

/** Forward-ref for NzbDrone.Core/MediaFiles/Commands/RetagFilesCommand.cs's fields (the real `Command` base class is Phase 4 Messaging, un-ported). */
export interface RetagFilesCommand {
  authorId: number;
  files: number[];
  updateCovers: boolean;
  embedMetadata: boolean;
}

/** Forward-ref for NzbDrone.Core/MediaFiles/Commands/RetagAuthorCommand.cs's fields. */
export interface RetagAuthorCommand {
  authorIds: number[];
  updateCovers: boolean;
  embedMetadata: boolean;
}
