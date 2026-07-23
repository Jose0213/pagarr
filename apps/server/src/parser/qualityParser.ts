import {
  Quality,
  newQualityModel,
  type Quality as QualityType,
  type QualityModel,
} from "../qualities/index.js";
import type { QualityDetectionSource } from "../qualities/index.js";

/**
 * Ported from NzbDrone.Core/Parser/QualityParser.cs.
 *
 * ## Regex restructuring for JS engine compatibility
 *
 * `VersionRegex` in the C# source is:
 * ```
 * \d[-._ ]?v(?<version>\d)[-._ ]|\[v(?<version>\d)\]
 * ```
 * This declares the SAME named capture group (`?<version>`) in two
 * different `|` alternation branches. That's valid .NET regex syntax (each
 * branch is mutually exclusive, so .NET allows reusing the name), but it's
 * a hard `SyntaxError: Duplicate capture group name` in JavaScript's regex
 * engine on the Node version this project's CI pins to (22.14.0) -- see
 * this worktree's CLAUDE.md and the fix already applied to
 * `profiles/metadata/metadataProfileService.ts`'s `PART_OR_SET_REGEXES` for
 * the exact prior-art pattern. Ported here the same way: split into two
 * single-alternative regexes (`VERSION_REGEXES` below), tried in order,
 * first match wins -- behaviorally identical to the C# alternation since
 * .NET's regex alternation is itself ordered/first-match.
 *
 * `CodecRegex` also declares many named groups, but each name is unique
 * across the whole pattern (no name repeats across `|` branches) -- valid
 * JS syntax as a single regex, ported 1:1 below.
 */

const PROPER_REGEX = /\b(?<proper>proper)\b/i;
const REPACK_REGEX = /\b(?<repack>repack|rerip)\b/i;

/**
 * Split from C#'s single `VersionRegex` (see module doc comment above) --
 * tried in order, first match wins.
 */
const VERSION_REGEXES: readonly RegExp[] = [
  /\d[-._ ]?v(?<version>\d)[-._ ]/i,
  /\[v(?<version>\d)\]/i,
];

const REAL_REGEX = /\b(?<real>REAL)\b/g;

const CODEC_REGEX =
  /\b(?:(?<PDF>PDF)|(?<MOBI>MOBI)|(?<EPUB>EPUB)|(?<AZW3>AZW3?)|(?<MP1>MPEG Version \d(.5)? Audio, Layer 1|MP1)|(?<MP2>MPEG Version \d(.5)? Audio, Layer 2|MP2)|(?<MP3VBR>MP3.*VBR|MPEG Version \d(.5)? Audio, Layer 3 vbr)|(?<MP3CBR>MP3|MPEG Version \d(.5)? Audio, Layer 3)|(?<FLAC>flac)|(?<WAVPACK>wavpack|wv)|(?<ALAC>alac)|(?<WMA>WMA\d?)|(?<WAV>WAV|PCM)|(?<AAC>M4A|M4P|M4B|AAC|mp4a|MPEG-4 Audio(?!.*alac))|(?<OGG>OGG|OGA|Vorbis))\b|(?<APE>monkey's audio|[[(].*\bape\b.*[\])])|(?<OPUS>Opus Version \d(.5)? Audio|[[(].*\bopus\b.*[\])])/i;

/** Ported from QualityParser.cs's `enum Codec`. */
export enum Codec {
  MP1 = "MP1",
  MP2 = "MP2",
  MP3CBR = "MP3CBR",
  MP3VBR = "MP3VBR",
  FLAC = "FLAC",
  ALAC = "ALAC",
  APE = "APE",
  WAVPACK = "WAVPACK",
  WMA = "WMA",
  AAC = "AAC",
  AACVBR = "AACVBR",
  OGG = "OGG",
  OPUS = "OPUS",
  WAV = "WAV",
  PDF = "PDF",
  EPUB = "EPUB",
  MOBI = "MOBI",
  AZW3 = "AZW3",
  Unknown = "Unknown",
}

/**
 * Ported from `MediaFileExtensions.GetQualityForExtension`/`AllExtensions`.
 * `NzbDrone.Core.MediaFiles` isn't a ported module yet (Phase 3); this is a
 * narrow, faithful port of just the lookup table QualityParser/Parser
 * actually depend on (constructor injection stand-in, same pattern as
 * `books/textMatching.ts`'s `ITextMatcher` seam), not the whole MediaFiles
 * module.
 */
const TEXT_EXTENSIONS: ReadonlyMap<string, QualityType> = new Map([
  [".epub", Quality.EPUB],
  [".kepub", Quality.EPUB],
  [".mobi", Quality.MOBI],
  [".azw3", Quality.AZW3],
  [".pdf", Quality.PDF],
]);

const AUDIO_EXTENSIONS: ReadonlyMap<string, QualityType> = new Map([
  [".flac", Quality.FLAC],
  [".ape", Quality.FLAC],
  [".wavpack", Quality.FLAC],
  [".wav", Quality.FLAC],
  [".alac", Quality.FLAC],
  [".mp2", Quality.MP3],
  [".mp3", Quality.MP3],
  [".wma", Quality.MP3],
  [".m4a", Quality.MP3],
  [".m4p", Quality.MP3],
  [".m4b", Quality.M4B],
  [".aac", Quality.MP3],
  [".mp4a", Quality.MP3],
  [".ogg", Quality.MP3],
  [".oga", Quality.MP3],
  [".vorbis", Quality.MP3],
]);

export const MediaFileExtensions = {
  TextExtensions: new Set(TEXT_EXTENSIONS.keys()),
  AudioExtensions: new Set(AUDIO_EXTENSIONS.keys()),
  AllExtensions: new Set([...TEXT_EXTENSIONS.keys(), ...AUDIO_EXTENSIONS.keys()]),
  /** Ported from `MediaFileExtensions.GetQualityForExtension(string extension)`: case-insensitive lookup. */
  GetQualityForExtension(extension: string): QualityType {
    const lower = extension.toLowerCase();
    return TEXT_EXTENSIONS.get(lower) ?? AUDIO_EXTENSIONS.get(lower) ?? Quality.Unknown;
  },
} as const;

/**
 * Ported from `QualityParser.ParseCodec(string name, string origName)`.
 * `origName` is unused in the C# source body too (kept as a parameter here
 * purely for call-site fidelity with `ParseQuality`'s two call sites).
 */
export function parseCodec(name: string | null | undefined, _origName: string): Codec {
  if (name === null || name === undefined || name.trim() === "") {
    return Codec.Unknown;
  }

  const match = CODEC_REGEX.exec(name);

  if (!match || !match.groups) {
    return Codec.Unknown;
  }

  const g = match.groups;

  if (g.PDF !== undefined) return Codec.PDF;
  if (g.EPUB !== undefined) return Codec.EPUB;
  if (g.MOBI !== undefined) return Codec.MOBI;
  if (g.AZW3 !== undefined) return Codec.AZW3;
  if (g.FLAC !== undefined) return Codec.FLAC;
  if (g.ALAC !== undefined) return Codec.ALAC;
  if (g.WMA !== undefined) return Codec.WMA;
  if (g.WAV !== undefined) return Codec.WAV;
  if (g.AAC !== undefined) return Codec.AAC;
  if (g.OGG !== undefined) return Codec.OGG;
  if (g.OPUS !== undefined) return Codec.OPUS;
  if (g.MP1 !== undefined) return Codec.MP1;
  if (g.MP2 !== undefined) return Codec.MP2;
  if (g.MP3VBR !== undefined) return Codec.MP3VBR;
  if (g.MP3CBR !== undefined) return Codec.MP3CBR;
  if (g.WAVPACK !== undefined) return Codec.WAVPACK;
  if (g.APE !== undefined) return Codec.APE;

  return Codec.Unknown;
}

function findQuality(codec: Codec): QualityType {
  switch (codec) {
    case Codec.ALAC:
    case Codec.FLAC:
    case Codec.WAVPACK:
    case Codec.WAV:
      return Quality.FLAC;
    case Codec.AAC:
      return Quality.M4B;
    default:
      return Quality.MP3;
  }
}

function parseQualityModifiers(name: string, normalizedName: string): QualityModel {
  const result = newQualityModel(Quality.Unknown);
  // C#'s QualityDetectionSource enum defaults to its first member (Name,
  // ordinal 0) on QualityModel construction; the ported QualityModel type
  // leaves the field optional/undefined by default (see qualities/
  // qualityModel.ts), so it's set explicitly here to preserve that
  // observable default -- ParseQuality's callers (e.g.
  // QualityParserFixture.should_parse_quality_from_name) rely on it.
  result.qualityDetectionSource = "Name";

  if (PROPER_REGEX.test(normalizedName)) {
    result.revision.version = 2;
  }

  if (REPACK_REGEX.test(normalizedName)) {
    result.revision.version = 2;
    result.revision.isRepack = true;
  }

  for (const regex of VERSION_REGEXES) {
    const versionMatch = regex.exec(normalizedName);
    if (versionMatch?.groups?.version !== undefined) {
      result.revision.version = Number(versionMatch.groups.version);
      break;
    }
  }

  // TODO: re-enable this when we have a reliable way to determine real
  const realMatches = name.match(REAL_REGEX);
  if (realMatches && realMatches.length > 0) {
    result.revision.real = realMatches.length;
  }

  return result;
}

/**
 * Ported from `QualityParser.ParseQuality(string name, string desc = null,
 * List<int> categories = null)`.
 */
export function parseQuality(
  name: string | null | undefined,
  desc: string | null | undefined = null,
  categories: number[] | null = null
): QualityModel {
  if (
    (name === null || name === undefined || name.trim() === "") &&
    (desc === null || desc === undefined || desc.trim() === "")
  ) {
    return newQualityModel(Quality.Unknown);
  }

  const safeName = name ?? "";
  const normalizedName = safeName.replace(/_/g, " ").trim().toLowerCase();
  const result = parseQualityModifiers(safeName, normalizedName);

  if (desc !== null && desc !== undefined && desc.trim() !== "") {
    const descCodec = parseCodec(desc, "");
    result.quality = findQuality(descCodec);

    if (result.quality.id !== Quality.Unknown.id) {
      result.qualityDetectionSource = "TagLib" satisfies QualityDetectionSource;
      return result;
    }
  }

  const codec = parseCodec(normalizedName, safeName);

  switch (codec) {
    case Codec.PDF:
      result.quality = Quality.PDF;
      break;
    case Codec.EPUB:
      result.quality = Quality.EPUB;
      break;
    case Codec.MOBI:
      result.quality = Quality.MOBI;
      break;
    case Codec.AZW3:
      result.quality = Quality.AZW3;
      break;
    case Codec.FLAC:
    case Codec.ALAC:
    case Codec.WAVPACK:
      result.quality = Quality.FLAC;
      break;
    case Codec.AAC:
      result.quality = Quality.M4B;
      break;
    case Codec.MP1:
    case Codec.MP2:
    case Codec.MP3VBR:
    case Codec.MP3CBR:
    case Codec.APE:
    case Codec.WMA:
    case Codec.WAV:
    case Codec.AACVBR:
    case Codec.OGG:
    case Codec.OPUS:
      result.quality = Quality.MP3;
      break;
    case Codec.Unknown:
    default:
      result.quality = Quality.Unknown;
      break;
  }

  // Based on extension
  if (result.quality.id === Quality.Unknown.id && !containsInvalidPathChars(safeName)) {
    try {
      result.quality = MediaFileExtensions.GetQualityForExtension(getPathExtension(safeName));
      result.qualityDetectionSource = "Extension" satisfies QualityDetectionSource;
    } catch {
      // Swallow exception for cases where string contains illegal path characters.
    }
  }

  // Based on category
  if (result.quality.id === Quality.Unknown.id && categories !== null) {
    if (categories.some((x) => x >= 3000 && x < 4000)) {
      result.quality = Quality.UnknownAudio;
      result.qualityDetectionSource = "Category" satisfies QualityDetectionSource;
    }
  }

  return result;
}

/**
 * Ported from `NzbDrone.Common.Extensions.PathExtensions.ContainsInvalidPathChars`
 * (transitively depended on by `QualityParser.ParseQuality`). Not itself in
 * the Parser module -- ported narrowly here since it's a one-line utility
 * with no other real caller in this worktree yet.
 */
function containsInvalidPathChars(path: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x1f<>:"|?*]/.test(path);
}

/** Ported from `Path.GetExtension` (via `NzbDrone.Common.Extensions.StringExtensions.GetPathExtension`), used only by ParseQuality's extension-based fallback. */
function getPathExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (dot === -1 || dot < slash) {
    return "";
  }
  return path.substring(dot);
}
