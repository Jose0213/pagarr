import type { LocalBook } from "../../parser/model/localBook.js";
import { removeFileExtension } from "../../parser/parser.js";
import { isSceneTitle } from "../../parser/sceneChecker.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/SceneNameCalculator.cs.
 * `Path.CleanFilePath()` (NzbDrone.Common.Extensions.StringExtensions) is
 * ported inline as `cleanFilePath` below (normalizes separators, matching
 * this repo's convention elsewhere -- see parser.ts's `splitPath`).
 */
export function getSceneName(localBook: LocalBook): string | null {
  const downloadClientInfo = localBook.downloadClientBookInfo;

  if (downloadClientInfo !== null && !downloadClientInfo.discography) {
    return removeFileExtension(downloadClientInfo.releaseTitle ?? "");
  }

  const fileName = fileNameWithoutExtension(cleanFilePath(localBook.path));

  if (isSceneTitle(fileName)) {
    return fileName;
  }

  const folderTitle = localBook.folderTrackInfo?.releaseTitle;

  if (
    localBook.folderTrackInfo?.discography === false &&
    folderTitle !== null &&
    folderTitle !== undefined &&
    folderTitle.trim() !== "" &&
    isSceneTitle(folderTitle)
  ) {
    return folderTitle;
  }

  return null;
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.CleanFilePath`: normalizes path separators to the platform's, collapsing duplicates. Here: forward-slash normalized, matching this repo's cross-platform path convention (see parser.ts). */
function cleanFilePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

/** Ported from `System.IO.Path.GetFileNameWithoutExtension`. */
function fileNameWithoutExtension(path: string): string {
  const base = path.substring(path.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.substring(0, dotIndex) : base;
}
