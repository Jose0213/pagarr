import type { Language } from "../../languages/index.js";

/**
 * Ported from NzbDrone.Core/Parser/Model/ReleaseInfo.cs.
 *
 * `DownloadProtocol` (`NzbDrone.Core.Indexers.DownloadProtocol`) and
 * `IndexerFlags`/`PendingReleaseReason` (Download.Pending, not ported yet)
 * are cross-module types this Parser-phase port doesn't own. `IndexerFlags`
 * IS declared in this same C# file though (see the `[Flags] enum
 * IndexerFlags` at the bottom of ReleaseInfo.cs), so it's ported here
 * faithfully as a real bitflag enum; `DownloadProtocol` and
 * `PendingReleaseReason` are kept as narrow string/number placeholders
 * (documented per field) since their real definitions live in modules not
 * yet ported (Indexers, Download.Pending -- both Phase 2/3).
 */

/** Ported from ReleaseInfo.cs's `[Flags] enum IndexerFlags`. */
export enum IndexerFlags {
  Freeleech = 1,
  Halfleech = 2,
  DoubleUpload = 4,
  Internal = 8,
  Scene = 16,
  Freeleech75 = 32,
  Freeleech25 = 64,
}

export interface ReleaseInfo {
  guid: string | null;
  title: string | null;
  size: number;
  downloadUrl: string | null;
  infoUrl: string | null;
  commentUrl: string | null;
  indexerId: number;
  indexer: string | null;
  author: string | null;
  book: string | null;
  indexerPriority: number;
  /** Ported from `DownloadProtocol` (NzbDrone.Core.Indexers, not yet ported) -- kept as a plain string placeholder for shape fidelity. */
  downloadProtocol: string | null;
  /** ISO-8601 timestamp string (C# `DateTime`, this codebase's convention -- see other ported modules' `string | null` date fields). */
  publishDate: string;

  origin: string | null;
  source: string | null;
  container: string | null;
  codec: string | null;
  categories: number[] | null;

  languages: Language[];

  /** `[JsonIgnore]` in C# -- not serialized. Bitflag combination of `IndexerFlags`. */
  indexerFlags: IndexerFlags;

  /**
   * `[JsonIgnore]` in C# -- not serialized. Ported from
   * `NzbDrone.Core.Download.Pending.PendingReleaseReason` (not yet ported);
   * kept as a plain string placeholder for shape fidelity.
   */
  pendingReleaseReason: string | null;
}

export function newReleaseInfo(): ReleaseInfo {
  return {
    guid: null,
    title: null,
    size: 0,
    downloadUrl: null,
    infoUrl: null,
    commentUrl: null,
    indexerId: 0,
    indexer: null,
    author: null,
    book: null,
    indexerPriority: 0,
    downloadProtocol: null,
    publishDate: new Date(0).toISOString(),
    origin: null,
    source: null,
    container: null,
    codec: null,
    categories: null,
    languages: [],
    // C#'s [Flags] enum has no explicit zero member either, but a freshly
    // constructed ReleaseInfo's IndexerFlags defaults to 0 (no flags set)
    // regardless -- cast needed since IndexerFlags declares no 0 member.
    indexerFlags: 0 as IndexerFlags,
    pendingReleaseReason: null,
  };
}

/** Ported from `ReleaseInfo.Age => DateTime.UtcNow.Subtract(PublishDate).Days`. */
export function releaseInfoAge(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Ported from `ReleaseInfo.AgeHours => DateTime.UtcNow.Subtract(PublishDate).TotalHours`. */
export function releaseInfoAgeHours(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return diffMs / (1000 * 60 * 60);
}

/** Ported from `ReleaseInfo.AgeMinutes => DateTime.UtcNow.Subtract(PublishDate).TotalMinutes`. */
export function releaseInfoAgeMinutes(release: ReleaseInfo): number {
  const diffMs = Date.now() - new Date(release.publishDate).getTime();
  return diffMs / (1000 * 60);
}

/** Ported from `ReleaseInfo.ToString()`: "[{PublishDate}] {Title} [{Size}]". */
export function releaseInfoToString(release: ReleaseInfo): string {
  return `[${release.publishDate}] ${release.title} [${release.size}]`;
}

/**
 * Ported from `ReleaseInfo.ToString(string format)`. `"L"` (long format)
 * mirrors the C# source's `StringBuilder.AppendLine` calls (each line
 * terminated with `\n`, matching C#'s `AppendLine` default on non-Windows
 * .NET runtimes this project targets -- see package.json's `engines.node`).
 * Any other format value falls back to `releaseInfoToString`.
 */
export function releaseInfoToStringFormat(release: ReleaseInfo, format: string): string {
  if (format.toUpperCase() === "L") {
    const lines = [
      `Guid: ${release.guid ?? "Empty"}`,
      `Title: ${release.title ?? "Empty"}`,
      `Size: ${release.size}`,
      `InfoUrl: ${release.infoUrl ?? "Empty"}`,
      `DownloadUrl: ${release.downloadUrl ?? "Empty"}`,
      `Indexer: ${release.indexer ?? "Empty"}`,
      `CommentUrl: ${release.commentUrl ?? "Empty"}`,
      `DownloadProtocol: ${release.downloadProtocol ?? "Empty"}`,
      `PublishDate: ${release.publishDate ?? "Empty"}`,
    ];
    return lines.join("\n") + "\n";
  }

  return releaseInfoToString(release);
}

/** Ported from `RemoteBook.ReleaseSourceType` / the `ReleaseSourceType` enum declared in RemoteBook.cs. */
export enum ReleaseSourceType {
  Unknown = 0,
  Rss = 1,
  Search = 2,
  UserInvokedSearch = 3,
  InteractiveSearch = 4,
  ReleasePush = 5,
}
