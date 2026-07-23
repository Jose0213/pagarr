import { statSync } from "node:fs";
import {
  ByteVector,
  CorruptFileError,
  File as TagLibFile,
  Id3v2FrameIdentifiers,
  MediaTypes,
  Picture,
  StringType,
  TagTypes,
  type ApeTag,
  type AsfTag,
  type Id3v2FrameIdentifier,
  type Id3v2Tag,
  type IAudioCodec,
  type Mpeg4AppleTag,
  type Tag,
  type XiphComment,
} from "node-taglib-sharp";
import { cleanTrackTitle } from "../parser/parser.js";
import { newQualityModel, type QualityModel } from "../qualities/qualityModel.js";
import { Quality } from "../qualities/quality.js";
import { parseQuality } from "../parser/qualityParser.js";
import type { MediaInfoModel } from "../parser/model/mediaInfoModel.js";
import { newParsedTrackInfo, type ParsedTrackInfo } from "../parser/model/parsedTrackInfo.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/AudioTag.cs.
 *
 * TagLib# (the .NET library the C# source reads/writes tags through) has no
 * built-in or standard-library Node equivalent. This port uses
 * `node-taglib-sharp` -- a from-scratch TypeScript port of the *same*
 * TagLib# library (same author-facing API shape: `File.createFromPath`,
 * `.tag`/`.properties`, `.tagTypesOnDisk`, `.getTag(type, create)`,
 * `TagTypes` bit-flag enum with identical member values, `IAudioCodec`
 * with the same `audioBitrate`/`audioChannels`/`audioSampleRate` fields) --
 * chosen specifically because it lets this file port the actual
 * field-by-field tag-mapping *logic* faithfully (the real value of
 * AudioTag.cs) rather than reimplementing binary tag-format parsing from
 * scratch or falling back to a read-only metadata library that couldn't
 * support `Write()`/retagging at all.
 *
 * Known API-surface gaps vs. real TagLib#, and how each is bridged:
 *   - ID3v2 raw frame access: C#'s `id3tag.GetTextAsString("TMED")` /
 *     `SetTextFrame(id, value)` take bare 4-char frame ID strings;
 *     node-taglib-sharp requires a `FrameIdentifier` object, looked up by
 *     that same 4-char string via its `FrameIdentifiers` dictionary
 *     (`FrameIdentifiers["TMED"]`) -- same frames, different indirection.
 *   - Apple/MP4 dash-box access: C#'s `AppleTag.GetDashBox(mean, name)` /
 *     `SetDashBox` and `.DataBoxes(id)` / `.SetText(id, value)` (raw QuickTime
 *     box access) map onto node-taglib-sharp's `getFirstItunesString(mean,
 *     name)` / `setItunesStrings(mean, name, value)` (dash boxes) and
 *     `getFirstQuickTimeString(boxType)` / `setQuickTimeString(boxType,
 *     value)` (plain QuickTime boxes, used here for the "day"/release-date
 *     box) -- equivalent operations, differently named.
 *   - `FixAppleId(ByteVector id)`: a C#-only helper padding a 3-character
 *     box id to TagLib#'s internal 4-byte box-id representation (only
 *     needed because C# TagLib#'s raw box API takes fixed-width byte ids).
 *     node-taglib-sharp's `getFirstQuickTimeString`/`setQuickTimeString`
 *     take the box type as a `ByteVector` built via `ByteVector.fromString`
 *     directly from the literal box-type string (`"day"` is already a
 *     valid 3-character QuickTime box type, same as the C# source uses) --
 *     no padding/fixup step is needed on this side, so `FixAppleId` has no
 *     port here.
 */

export interface AudioTagLogger {
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const noopLogger: AudioTagLogger = {
  debug: () => {},
  trace: () => {},
  warn: () => {},
  error: () => {},
};

/** Ported from `AudioTag.Diff`'s return type: `Dictionary<string, Tuple<string, string>>`. */
export type AudioTagDiff = Record<string, [string | null, string | null]>;

/** Same-calendar-day comparison, ported from the C# source's `Date?.Date != other.Date?.Date` (compares dates, ignoring time-of-day). */
function sameDate(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function formatYyyyMmDd(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export class AudioTag {
  title: string | null = null;
  performers: string[] = [];
  bookAuthors: string[] = [];
  track = 0;
  trackCount = 0;
  book: string | null = null;
  disc = 0;
  discCount = 0;
  media: string | null = null;
  date: Date | null = null;
  originalReleaseDate: Date | null = null;
  year = 0;
  originalYear = 0;
  publisher: string | null = null;
  /** C# `TimeSpan Duration`, ported as milliseconds (this module's TimeSpan convention -- see parsedTrackInfo.ts). */
  durationMs = 0;
  genres: string[] = [];
  imageFile: string | null = null;
  imageSize = 0;

  isValid = false;
  quality: QualityModel | null = null;
  mediaInfo: MediaInfoModel | null = null;

  private readonly logger: AudioTagLogger;

  /** Ported from the parameterless `AudioTag()` constructor (`IsValid = true`) plus the `AudioTag(string path)` overload. */
  constructor(path?: string, logger: AudioTagLogger = noopLogger) {
    this.logger = logger;
    if (path === undefined) {
      this.isValid = true;
    } else {
      this.read(path);
    }
  }

  /** Ported from `AudioTag.Read(string path)`. */
  read(path: string): void {
    this.logger.debug(`Starting tag read for ${path}`);

    this.isValid = false;
    let file: TagLibFile | undefined;

    try {
      file = TagLibFile.createFromPath(path);
      const tag = file.tag;

      this.title = tag.title || tag.titleSort || null;
      this.performers = (tag.performers?.length ? tag.performers : tag.performersSort) ?? [];

      const authors: string[] = [];
      if (tag.albumArtists?.length) {
        authors.push(...tag.albumArtists);
      } else if (tag.albumArtistsSort?.length) {
        authors.push(...tag.albumArtistsSort);
      }

      if (tag.performers?.length) {
        authors.push(...tag.performers);
      } else if (tag.performersSort?.length) {
        authors.push(...tag.performersSort);
      }

      this.bookAuthors = Array.from(new Set(authors));
      this.track = tag.track;
      this.trackCount = tag.trackCount;
      this.book = tag.album || tag.albumSort || null;
      this.disc = tag.disc;
      this.discCount = tag.discCount;
      this.year = tag.year;
      this.publisher = tag.publisher || null;
      this.durationMs = file.properties.durationMilliseconds;
      this.genres = tag.genres ?? [];
      this.imageSize = tag.pictures?.[0]?.data?.length ?? 0;

      // Do the ones that aren't handled by the generic taglib implementation.
      if (file.tagTypesOnDisk & TagTypes.Id3v2) {
        const id3tag = file.getTag(TagTypes.Id3v2, false) as Id3v2Tag;
        this.media = getId3TextOrNull(id3tag, "TMED");
        this.date = readId3Date(id3tag, "TDRC");
        this.originalReleaseDate = readId3Date(id3tag, "TDOR");
      } else if (file.tagTypesOnDisk & TagTypes.Xiph) {
        // While publisher is handled by taglib, it seems to be mapped to
        // 'ORGANIZATION' and not 'LABEL' like Picard is.
        // https://picard.musicbrainz.org/docs/mappings/
        const flactag = file.getTag(TagTypes.Xiph, false) as XiphComment;
        this.media = exclusiveOrDefault(flactag.getField("MEDIA"));
        this.date = parseDateOrNull(exclusiveOrDefault(flactag.getField("DATE")));
        this.originalReleaseDate = parseDateOrNull(
          exclusiveOrDefault(flactag.getField("ORIGINALDATE"))
        );
        this.publisher = exclusiveOrDefault(flactag.getField("LABEL"));
      } else if (file.tagTypesOnDisk & TagTypes.Ape) {
        const apetag = file.getTag(TagTypes.Ape, false) as ApeTag;
        this.media = apetag.getItem("Media")?.toString() ?? null;
        this.date = parseDateOrNull(apetag.getItem("Year")?.toString() ?? null);
        this.originalReleaseDate = parseDateOrNull(
          apetag.getItem("Original Date")?.toString() ?? null
        );
        this.publisher = apetag.getItem("Label")?.toString() ?? null;
      } else if (file.tagTypesOnDisk & TagTypes.Asf) {
        const asftag = file.getTag(TagTypes.Asf, false) as AsfTag;
        this.media = asftag.getDescriptorString("WM/Media") || null;
        this.date = parseDateOrNull(asftag.getDescriptorString("WM/Year") || null);
        this.originalReleaseDate = parseDateOrNull(
          asftag.getDescriptorString("WM/OriginalReleaseTime") || null
        );
        this.publisher = asftag.getDescriptorString("WM/Publisher") || null;
      } else if (file.tagTypesOnDisk & TagTypes.Apple) {
        const appletag = file.getTag(TagTypes.Apple, false) as Mpeg4AppleTag;
        this.media = appletag.getFirstItunesString("com.apple.iTunes", "MEDIA") || null;
        this.date = parseDateOrNull(
          appletag.getFirstQuickTimeString(ByteVector.fromString("day", StringType.Latin1)) || null
        );
        this.originalReleaseDate = parseDateOrNull(
          appletag.getFirstItunesString("com.apple.iTunes", "Original Date") || null
        );
      }

      this.originalYear = this.originalReleaseDate ? this.originalReleaseDate.getUTCFullYear() : 0;

      for (const codec of file.properties.codecs) {
        const acodec = codec as unknown as IAudioCodec;

        if (acodec && (codec.mediaTypes & MediaTypes.Audio) !== 0) {
          let bitrate = acodec.audioBitrate;
          if (bitrate === 0) {
            // Taglib can't read bitrate for Opus.
            bitrate = estimateBitrate(file, path);
          }

          this.logger.debug(
            "Audio Properties: " +
              codec.description +
              ", Bitrate: " +
              String(bitrate) +
              ", Sample Size: " +
              String(file.properties.bitsPerSample) +
              ", SampleRate: " +
              String(acodec.audioSampleRate) +
              ", Channels: " +
              String(acodec.audioChannels)
          );

          this.quality = parseQuality(file.name ?? path, codec.description);
          this.logger.debug(
            `Quality parsed: ${JSON.stringify(this.quality)}, Source: ${String(this.quality.qualityDetectionSource)}`
          );

          this.mediaInfo = {
            audioFormat: codec.description,
            audioBitrate: bitrate,
            audioChannels: acodec.audioChannels,
            audioBits: file.properties.bitsPerSample,
            audioSampleRate: acodec.audioSampleRate,
          };
        }
      }

      this.isValid = true;
    } catch (ex) {
      if (ex instanceof CorruptFileError) {
        this.logger.warn(`Tag reading failed for ${path}.  File is corrupt`, ex);
      } else {
        // Log as error so it goes to sentry with correct fingerprint.
        this.logger.error("Tag reading failed for {0}", path, ex);
      }
    } finally {
      file?.dispose();
    }

    // Make sure these are initialized to avoid errors later on.
    if (this.quality === null) {
      this.quality = parseQuality(path);
      this.logger.debug(
        `Unable to parse qulity from tag, Quality parsed from file path: ${JSON.stringify(this.quality)}, Source: ${String(this.quality.qualityDetectionSource)}`
      );
    }

    this.mediaInfo = this.mediaInfo ?? {
      audioFormat: null,
      audioBitrate: 0,
      audioChannels: 0,
      audioBits: 0,
      audioSampleRate: 0,
    };
  }

  /** Ported from `AudioTag.Write(string path)`. */
  write(path: string): void {
    this.logger.debug(`Starting tag write for ${path}`);

    // Patch up any null fields to work around TagLib exception for
    // WMA with null performers/bookauthors.
    this.performers ??= [];
    this.bookAuthors ??= [];
    this.genres ??= [];

    let file: TagLibFile | undefined;
    try {
      file = TagLibFile.createFromPath(path);
      const tag = file.tag;

      // Do the ones with direct support in TagLib.
      tag.title = this.title ?? "";
      tag.performers = this.performers;
      tag.albumArtists = this.bookAuthors;
      tag.track = this.track;
      tag.trackCount = this.trackCount;
      tag.album = this.book ?? "";
      tag.disc = this.disc;
      tag.discCount = this.discCount;
      tag.publisher = this.publisher ?? "";
      tag.genres = this.genres;

      if (this.imageFile) {
        tag.pictures = [Picture.fromPath(this.imageFile)];
      }

      if (file.tagTypes & TagTypes.Id3v2) {
        const id3tag = file.getTag(TagTypes.Id3v2, true) as Id3v2Tag;
        setId3Text(id3tag, "TMED", this.media);
        writeId3Date(id3tag, "TDRC", "TYER", "TDAT", this.date);
        writeId3Date(id3tag, "TDOR", "TORY", null, this.originalReleaseDate);
      } else if (file.tagTypes & TagTypes.Xiph) {
        // While publisher is handled by taglib, it seems to be mapped to
        // 'ORGANIZATION' and not 'LABEL' like Picard is.
        tag.publisher = "";

        // taglib inserts leading zeros so set manually.
        tag.track = 0;

        const flactag = file.getTag(TagTypes.Xiph, true) as XiphComment;

        flactag.setFieldAsStrings("DATE", ...(this.date ? [formatYyyyMmDd(this.date)] : []));
        flactag.setFieldAsStrings(
          "ORIGINALDATE",
          ...(this.originalReleaseDate ? [formatYyyyMmDd(this.originalReleaseDate)] : [])
        );
        flactag.setFieldAsStrings(
          "ORIGINALYEAR",
          ...(this.originalReleaseDate ? [String(this.originalReleaseDate.getUTCFullYear())] : [])
        );
        flactag.setFieldAsUint("TRACKTOTAL", this.trackCount);
        flactag.setFieldAsUint("TOTALTRACKS", this.trackCount);
        flactag.setFieldAsUint("TRACKNUMBER", this.track);
        flactag.setFieldAsUint("TOTALDISCS", this.discCount);
        flactag.setFieldAsStrings("MEDIA", ...(this.media ? [this.media] : []));
        flactag.setFieldAsStrings("LABEL", ...(this.publisher ? [this.publisher] : []));
      } else if (file.tagTypes & TagTypes.Ape) {
        const apetag = file.getTag(TagTypes.Ape, true) as ApeTag;

        apetag.setStringValue("Year", this.date ? formatYyyyMmDd(this.date) : "");
        apetag.setStringValue(
          "Original Date",
          this.originalReleaseDate ? formatYyyyMmDd(this.originalReleaseDate) : ""
        );
        apetag.setStringValue(
          "Original Year",
          this.originalReleaseDate ? String(this.originalReleaseDate.getUTCFullYear()) : ""
        );
        apetag.setStringValue("Media", this.media ?? "");
        apetag.setStringValue("Label", this.publisher ?? "");
      } else if (file.tagTypes & TagTypes.Asf) {
        const asftag = file.getTag(TagTypes.Asf, true) as AsfTag;

        asftag.setDescriptorString(this.date ? formatYyyyMmDd(this.date) : "", "WM/Year");
        asftag.setDescriptorString(
          this.originalReleaseDate ? formatYyyyMmDd(this.originalReleaseDate) : "",
          "WM/OriginalReleaseTime"
        );
        asftag.setDescriptorString(
          this.originalReleaseDate ? String(this.originalReleaseDate.getUTCFullYear()) : "",
          "WM/OriginalReleaseYear"
        );
        asftag.setDescriptorString(this.media ?? "", "WM/Media");
        asftag.setDescriptorString(this.publisher ?? "", "WM/Publisher");
      } else if (file.tagTypes & TagTypes.Apple) {
        const appletag = file.getTag(TagTypes.Apple, true) as Mpeg4AppleTag;

        appletag.setQuickTimeString(
          ByteVector.fromString("day", StringType.Latin1),
          this.date ? formatYyyyMmDd(this.date) : ""
        );
        appletag.setItunesStrings(
          "com.apple.iTunes",
          "Original Date",
          this.originalReleaseDate ? formatYyyyMmDd(this.originalReleaseDate) : ""
        );
        appletag.setItunesStrings(
          "com.apple.iTunes",
          "Original Year",
          this.originalReleaseDate ? String(this.originalReleaseDate.getUTCFullYear()) : ""
        );
        appletag.setItunesStrings("com.apple.iTunes", "MEDIA", this.media ?? "");
      }

      file.save();
    } catch (ex) {
      if (ex instanceof CorruptFileError) {
        this.logger.warn(`Tag writing failed for ${path}.  File is corrupt`, ex);
      } else {
        this.logger.warn(`Tag writing failed for ${path}`, ex);
      }
    } finally {
      file?.dispose();
    }
  }

  /** Ported from `AudioTag.Diff(AudioTag other)`. */
  diff(other: AudioTag): AudioTagDiff {
    const output: AudioTagDiff = {};

    if (!this.isValid || !other.isValid) {
      return output;
    }

    if (this.title !== other.title) {
      output["Title"] = [this.title, other.title];
    }

    if (!arraysEqual(this.performers, other.performers)) {
      const oldValue = this.performers.length ? this.performers.join(" / ") : null;
      const newValue = other.performers.length ? other.performers.join(" / ") : null;
      output["Author"] = [oldValue, newValue];
    }

    if (this.book !== other.book) {
      output["Book"] = [this.book, other.book];
    }

    if (!arraysEqual(this.bookAuthors, other.bookAuthors)) {
      const oldValue = this.bookAuthors.length ? this.bookAuthors.join(" / ") : null;
      const newValue = other.bookAuthors.length ? other.bookAuthors.join(" / ") : null;
      output["Book Author"] = [oldValue, newValue];
    }

    if (this.track !== other.track) {
      output["Track"] = [String(this.track), String(other.track)];
    }

    if (this.trackCount !== other.trackCount) {
      output["Track Count"] = [String(this.trackCount), String(other.trackCount)];
    }

    if (this.disc !== other.disc) {
      output["Disc"] = [String(this.disc), String(other.disc)];
    }

    if (this.discCount !== other.discCount) {
      output["Disc Count"] = [String(this.discCount), String(other.discCount)];
    }

    if (this.media !== other.media) {
      output["Media Format"] = [this.media, other.media];
    }

    if (!sameDate(this.date, other.date)) {
      output["Date"] = [
        this.date ? formatYyyyMmDd(this.date) : null,
        other.date ? formatYyyyMmDd(other.date) : null,
      ];
    }

    if (!sameDate(this.originalReleaseDate, other.originalReleaseDate)) {
      // Id3v2.3 tags can only store the year, not the full date.
      if (
        this.originalReleaseDate &&
        this.originalReleaseDate.getUTCMonth() === 0 &&
        this.originalReleaseDate.getUTCDate() === 1
      ) {
        if (
          other.originalReleaseDate &&
          this.originalReleaseDate.getUTCFullYear() !== other.originalReleaseDate.getUTCFullYear()
        ) {
          output["Original Year"] = [
            String(this.originalReleaseDate.getUTCFullYear()),
            String(other.originalReleaseDate.getUTCFullYear()),
          ];
        }
      } else {
        output["Original Release Date"] = [
          this.originalReleaseDate ? formatYyyyMmDd(this.originalReleaseDate) : null,
          other.originalReleaseDate ? formatYyyyMmDd(other.originalReleaseDate) : null,
        ];
      }
    }

    if (this.publisher !== other.publisher) {
      output["Label"] = [this.publisher, other.publisher];
    }

    if (!arraysEqual(this.genres, other.genres)) {
      output["Genres"] = [this.genres.join(" / "), other.genres.join(" / ")];
    }

    if (this.imageSize !== other.imageSize) {
      output["Image Size"] = [String(this.imageSize), String(other.imageSize)];
    }

    return output;
  }

  /**
   * Ported from `AudioTag.operator ParsedTrackInfo(AudioTag tag)` (implicit
   * conversion operator). TS has no operator-overload equivalent; ported
   * as a free function -- matching this module's convention for C#
   * conversion operators (see quality.ts's `qualityFromId` note).
   */
  toParsedTrackInfo(): ParsedTrackInfo {
    if (!this.isValid) {
      const info = newParsedTrackInfo();
      info.quality = this.quality ?? newQualityModel(Quality.Unknown);
      info.mediaInfo = this.mediaInfo ?? {
        audioFormat: null,
        audioBitrate: 0,
        audioChannels: 0,
        audioBits: 0,
        audioSampleRate: 0,
      };
      return info;
    }

    let authors = this.bookAuthors.filter((x) => x.trim() !== "");
    if (authors.length === 0) {
      authors = this.performers.filter((x) => x.trim() !== "");
    }

    const info = newParsedTrackInfo();
    info.bookTitle = this.book ? this.book : this.title;
    info.authors = authors;
    info.discNumber = this.disc;
    info.discCount = this.discCount;
    info.year = this.year;
    info.label = this.publisher;
    info.trackNumbers = [this.track];
    info.title = this.title;
    info.cleanTitle = this.title ? cleanTrackTitle(this.title) : null;
    info.durationMs = this.durationMs;
    info.quality = this.quality;
    info.mediaInfo = this.mediaInfo;

    return info;
  }
}

/** Ported from `TagLib.Ogg.XiphComment.GetField(key).ExclusiveOrDefault()` (TagLib#'s extension method: single value if exactly one, else null). */
function exclusiveOrDefault(values: string[] | undefined): string | null {
  if (!values || values.length !== 1) {
    return null;
  }
  return values[0]!;
}

function parseDateOrNull(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getId3TextOrNull(tag: Id3v2Tag, frameId: string): string | null {
  const identifier = requireFrameIdentifier(frameId);
  const value = tag.getTextAsString(identifier);
  return value || null;
}

function setId3Text(tag: Id3v2Tag, frameId: string, value: string | null): void {
  const identifier = requireFrameIdentifier(frameId);
  if (value) {
    tag.setTextFrame(identifier, value);
  } else {
    tag.setTextFrame(identifier, "");
  }
}

/**
 * Looks up node-taglib-sharp's `Id3v2FrameIdentifiers` (a `{ [key: string]:
 * FrameIdentifier }` dictionary keyed by the bare ID3v2.4 frame id string,
 * e.g. `"TDRC"`), the node-taglib-sharp equivalent of C# TagLib#'s
 * bare-string frame-id overloads (`tag.GetTextAsString("TDRC")`).
 */
function requireFrameIdentifier(frameId: string): Id3v2FrameIdentifier {
  const identifier = Id3v2FrameIdentifiers[frameId];
  if (!identifier) {
    throw new Error(`Unknown ID3v2 frame identifier: ${frameId}`);
  }
  return identifier;
}

/**
 * Ported from `AudioTag.ReadId3Date(TagLib.Id3v2.Tag tag, string dateTag)`.
 */
function readId3Date(tag: Id3v2Tag, dateTag: string): Date | null {
  const identifier = requireFrameIdentifier(dateTag);
  const date = tag.getTextAsString(identifier);

  if (tag.version === 4) {
    // The unabused TDRC/TDOR tags.
    return parseDateOrNull(date);
  } else if (dateTag === "TDRC") {
    // Taglib maps the v3 TYER and TDAT to TDRC but does it incorrectly.
    // C# used DateTime.TryParseExact(date, "yyyy-dd-MM", ...) -- day and
    // month positions swapped, matching the real (buggy) TagLib# v3
    // TYER+TDAT mapping this ported faithfully rather than "fixed".
    return parseExactYyyyDdMm(date);
  } else {
    // Taglib maps the v3 TORY to TDRC so we just get a year.
    const year = Number.parseInt(date, 10);
    if (
      !Number.isNaN(year) &&
      String(year) === date.trim() &&
      year >= 1860 &&
      year <= new Date().getUTCFullYear() + 1
    ) {
      return new Date(Date.UTC(year, 0, 1));
    }
    return null;
  }
}

/** Ported from `DateTime.TryParseExact(date, "yyyy-dd-MM", ...)`: strict `yyyy-dd-MM` parse, null on any mismatch. */
function parseExactYyyyDdMm(date: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const day = Number(match[2]);
  const month = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const result = new Date(Date.UTC(year, month - 1, day));
  // Reject overflowed dates (e.g. day 31 in a 30-day month), matching TryParseExact's strictness.
  if (
    result.getUTCFullYear() !== year ||
    result.getUTCMonth() !== month - 1 ||
    result.getUTCDate() !== day
  ) {
    return null;
  }

  return result;
}

/** Ported from `AudioTag.WriteId3Date`. */
function writeId3Date(
  tag: Id3v2Tag,
  v4field: string,
  v3yyyy: string,
  v3ddmm: string | null,
  date: Date | null
): void {
  if (tag.version === 4) {
    setId3Text(tag, v3yyyy, null);
    if (v3ddmm) {
      setId3Text(tag, v3ddmm, null);
    }

    setId3Text(tag, v4field, date ? formatYyyyMmDd(date) : null);
  } else {
    setId3Text(tag, v4field, null);
    setId3Text(tag, v3yyyy, date ? String(date.getUTCFullYear()) : null);
    if (v3ddmm) {
      const dd = date ? String(date.getUTCDate()).padStart(2, "0") : null;
      const mm = date ? String(date.getUTCMonth() + 1).padStart(2, "0") : null;
      setId3Text(tag, v3ddmm, date ? `${dd}${mm}` : null);
    }
  }
}

/** Ported from `AudioTag.EstimateBitrate`: size-over-duration bitrate estimate, used when TagLib can't read it directly (Opus). */
function estimateBitrate(file: TagLibFile, path: string): number {
  try {
    const size = statSync(path).size;
    const durationSeconds = file.properties.durationMilliseconds / 1000;
    if (durationSeconds <= 0) {
      return 0;
    }
    return Math.trunc((size * 8) / (durationSeconds * 1024));
  } catch {
    return 0;
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
}

/** Re-exported so callers can reference the generic `Tag` type without importing node-taglib-sharp directly. */
export type { Tag };
