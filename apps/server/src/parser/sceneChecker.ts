import { Quality } from "../qualities/index.js";
import { parseTitle } from "./parser.js";
import { authorTitle } from "./model/parsedTrackInfo.js";

/**
 * Ported from NzbDrone.Core/Parser/SceneChecker.cs.
 *
 * "This method should prefer false negatives over false positives. It's
 * better not to use a title that might be scene than to use one that
 * isn't scene." -- comment preserved verbatim from the C# source.
 */
export function isSceneTitle(title: string): boolean {
  if (!title.includes(".")) {
    return false;
  }

  if (title.includes(" ")) {
    return false;
  }

  const parsedTitle = parseTitle(title);

  if (
    parsedTitle === null ||
    parsedTitle.releaseGroup === null ||
    parsedTitle.quality === null ||
    parsedTitle.quality.quality.id === Quality.Unknown.id ||
    (authorTitle(parsedTitle) ?? "").trim() === ""
  ) {
    return false;
  }

  return true;
}
