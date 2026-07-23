import type { LocalEdition } from "../../../../parser/model/localEdition.js";
import type { LocalBook } from "../../../../parser/model/localBook.js";
import type { IAggregate } from "./aggregateLocalTrack.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/Aggregators/AggregateFilenameInfo.cs.
 *
 * Each of the 13 patterns below is its own independent `RegExp` (not an
 * alternation branch within a single regex), so named capture groups are
 * safely reused ACROSS patterns without tripping the "duplicate named
 * group within one regex" JS restriction this project's `check:regex`
 * guards against (see parser.ts's module doc comment for that project-wide
 * gotcha) -- each pattern only ever declares a given group name once
 * within itself.
 */

const CHARS_AND_SEPS: readonly { chars: string; sep: string }[] = [
  { chars: "a-z0-9,\\(\\)\\.&'’\\s", sep: "\\s_-" },
  { chars: "a-z0-9,\\(\\)\\.\\&'’_", sep: "\\s-" },
];

function patterns(chars: string, sep: string): RegExp[] {
  const sep1 = `(?<sep>[${sep}]+)`;
  const author = `(?<author>[${chars}]+)`;
  const track = `(?<track>\\d+)`;
  const title = `(?<title>[${chars}]+)`;
  const tag = `(?<tag>[${chars}]+)`;

  // Ported from C#'s `\k<sep>` backreference-to-named-group syntax, which
  // JS regex also supports natively.
  const sepn = "\\k<sep>";

  return [
    new RegExp(`^${track}${sep1}${author}${sepn}${title}${sepn}${tag}$`, "i"),
    new RegExp(`^${track}${sep1}${author}${sepn}${tag}${sepn}${title}$`, "i"),
    new RegExp(`^${track}${sep1}${author}${sepn}${title}$`, "i"),

    new RegExp(`^${author}${sep1}${tag}${sepn}${track}${sepn}${title}$`, "i"),
    new RegExp(`^${author}${sep1}${track}${sepn}${title}${sepn}${tag}$`, "i"),
    new RegExp(`^${author}${sep1}${track}${sepn}${title}$`, "i"),

    new RegExp(`^${author}${sep1}${title}${sepn}${tag}$`, "i"),
    new RegExp(`^${author}${sep1}${tag}${sepn}${title}$`, "i"),
    new RegExp(`^${author}${sep1}${title}$`, "i"),

    new RegExp(`^${track}${sep1}${title}$`, "i"),
    new RegExp(`^${track}${sep1}${tag}${sepn}${title}$`, "i"),
    new RegExp(`^${track}${sep1}${title}${sepn}${tag}$`, "i"),

    new RegExp(`^${title}$`, "i"),
  ];
}

export class AggregateFilenameInfo implements IAggregate<LocalEdition> {
  aggregate(release: LocalEdition): LocalEdition {
    const tracks = release.localBooks;

    if (
      tracks.some((x) => isNullOrWhiteSpace(x.fileTrackInfo?.bookTitle)) ||
      tracks.some((x) => isNullOrWhiteSpace(authorTitleOf(x)))
    ) {
      for (const charSep of CHARS_AND_SEPS) {
        for (const pattern of patterns(charSep.chars, charSep.sep)) {
          const matches = allMatches(tracks, pattern);
          if (matches !== null) {
            applyMatches(matches, pattern);
          }
        }
      }
    }

    return release;
  }
}

function authorTitleOf(track: LocalBook): string | undefined {
  return track.fileTrackInfo?.authors[0];
}

function isNullOrWhiteSpace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

function allMatches(tracks: LocalBook[], pattern: RegExp): Map<LocalBook, RegExpMatchArray> | null {
  const matches = new Map<LocalBook, RegExpMatchArray>();

  for (const track of tracks) {
    const filename = removeAccent(fileNameWithoutExtension(track.path));
    const match = pattern.exec(filename);

    if (match !== null && match[0] !== undefined) {
      matches.set(track, match);
    } else {
      return null;
    }
  }

  return matches;
}

function equalFields(matches: IterableIterator<RegExpMatchArray>, field: string): boolean {
  const values = new Set<string>();
  for (const m of matches) {
    values.add(m.groups?.[field] ?? "");
  }
  return values.size === 1;
}

function applyMatches(matches: Map<LocalBook, RegExpMatchArray>, pattern: RegExp): void {
  const keys = groupNames(pattern);
  const someMatch = [...matches.values()][0]!;

  // only proceed if the 'tag' field is equal across all filenames
  if (keys.has("tag") && !equalFields(matches.values(), "tag")) {
    return;
  }

  // Given both an "author" and "title" field, assume that one is
  // *actually* the author, which must be uniform, and use the other
  // for the title. This, of course, won't work for VA books.
  let titleField: string;
  let author: string;

  if (keys.has("author")) {
    if (equalFields(matches.values(), "author")) {
      author = (someMatch.groups?.["author"] ?? "").trim();
      titleField = "title";
    } else if (equalFields(matches.values(), "title")) {
      author = (someMatch.groups?.["title"] ?? "").trim();
      titleField = "author";
    } else {
      // both vary, abort
      return;
    }

    for (const track of matches.keys()) {
      if (isNullOrWhiteSpace(authorTitleOf(track)) && track.fileTrackInfo !== null) {
        track.fileTrackInfo.authors = [author];
      }
    }
  } else {
    // no author - remaining field is the title
    titleField = "title";
  }

  // Apply the title and track
  for (const [track, match] of matches) {
    if (track.fileTrackInfo === null) {
      continue;
    }

    if (isNullOrWhiteSpace(track.fileTrackInfo.bookTitle)) {
      const title = (match.groups?.[titleField] ?? "").trim();
      track.fileTrackInfo.bookTitle = title;
    }

    const trackNums = track.fileTrackInfo.trackNumbers;
    if (keys.has("track") && (trackNums.length === 0 || trackNums[0] === 0)) {
      let tracknum = Number.parseInt(match.groups?.["track"] ?? "0", 10);
      if (tracknum > 100) {
        track.fileTrackInfo.discNumber = Math.trunc(tracknum / 100);
        tracknum = tracknum % 100;
      }

      track.fileTrackInfo.trackNumbers = [tracknum];
    }
  }
}

/** Ported from `Regex.GetGroupNames()`, excluding the numeric group-0 name JS doesn't surface here anyway. */
function groupNames(pattern: RegExp): Set<string> {
  const source = pattern.source;
  const names = new Set<string>();
  const re = /\(\?<([a-zA-Z_][a-zA-Z0-9_]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.add(m[1]!);
  }
  return names;
}

/** Ported from `System.IO.Path.GetFileNameWithoutExtension`. */
function fileNameWithoutExtension(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const base = normalized.substring(normalized.lastIndexOf("/") + 1);
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.substring(0, dotIndex) : base;
}

/** Ported from `NzbDrone.Common.Extensions.StringExtensions.RemoveAccent` -- see parser.ts's private helper of the same name. */
function removeAccent(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}
