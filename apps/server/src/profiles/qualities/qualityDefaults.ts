import type { Quality } from "../../qualities/quality.js";

/**
 * Local stand-in for the parts of NzbDrone.Core/Qualities/Quality.cs's
 * static surface that QualityProfileService.GetDefaultProfile /
 * Handle(ApplicationStartedEvent) actually read: the fixed `Quality.All`
 * list and `Quality.DefaultQualityDefinitions` (Weight/GroupWeight/
 * GroupName per quality). Both are `static readonly` data in C# -- not
 * configurable, not database-backed -- so hardcoding the same 9 values here
 * is a faithful port, not a design decision. See profiles/quality.ts's doc
 * comment for why this doesn't import from the sibling port/qualities
 * worktree.
 *
 * GroupWeight is distinct from Weight in general (Readarr uses matching
 * GroupWeight to bucket multiple qualities, e.g. different resolutions of
 * the same source, under one profile-editor group), but for every quality
 * Readarr ships today GroupWeight == Weight -- i.e. no quality currently
 * shares a group with another. QualityProfileService.GetDefaultProfile's
 * `group.Count() == 1` branch is therefore always the one taken today; the
 * `> 1` grouping branch is ported faithfully anyway since it's real,
 * reachable code (a future quality addition, or a hand-edited profile,
 * could exercise it), just not exercised by the *default* profiles.
 */
export const QUALITY_UNKNOWN: Quality = { id: 0, name: "Unknown Text" };
export const QUALITY_PDF: Quality = { id: 1, name: "PDF" };
export const QUALITY_MOBI: Quality = { id: 2, name: "MOBI" };
export const QUALITY_EPUB: Quality = { id: 3, name: "EPUB" };
export const QUALITY_AZW3: Quality = { id: 4, name: "AZW3" };
export const QUALITY_MP3: Quality = { id: 10, name: "MP3" };
export const QUALITY_FLAC: Quality = { id: 11, name: "FLAC" };
export const QUALITY_M4B: Quality = { id: 12, name: "M4B" };
export const QUALITY_UNKNOWN_AUDIO: Quality = { id: 13, name: "Unknown Audio" };

export const ALL_QUALITIES: Quality[] = [
  QUALITY_UNKNOWN,
  QUALITY_PDF,
  QUALITY_MOBI,
  QUALITY_EPUB,
  QUALITY_AZW3,
  QUALITY_UNKNOWN_AUDIO,
  QUALITY_MP3,
  QUALITY_M4B,
  QUALITY_FLAC,
];

export interface QualityDefinitionDefault {
  quality: Quality;
  weight: number;
  groupWeight: number;
  groupName?: string;
  minSize: number;
  maxSize: number | null;
}

/** Ported from Quality's static constructor's `DefaultQualityDefinitions` HashSet init. */
export const DEFAULT_QUALITY_DEFINITIONS: QualityDefinitionDefault[] = [
  { quality: QUALITY_UNKNOWN, weight: 1, groupWeight: 1, minSize: 0, maxSize: 350 },
  { quality: QUALITY_PDF, weight: 5, groupWeight: 2, minSize: 0, maxSize: 350 },
  { quality: QUALITY_MOBI, weight: 10, groupWeight: 10, minSize: 0, maxSize: 350 },
  { quality: QUALITY_EPUB, weight: 11, groupWeight: 11, minSize: 0, maxSize: 350 },
  { quality: QUALITY_AZW3, weight: 12, groupWeight: 12, minSize: 0, maxSize: 350 },
  { quality: QUALITY_UNKNOWN_AUDIO, weight: 50, groupWeight: 50, minSize: 0, maxSize: 350 },
  { quality: QUALITY_MP3, weight: 100, groupWeight: 100, minSize: 0, maxSize: 350 },
  { quality: QUALITY_M4B, weight: 105, groupWeight: 105, minSize: 0, maxSize: 350 },
  { quality: QUALITY_FLAC, weight: 110, groupWeight: 110, minSize: 0, maxSize: null },
];
