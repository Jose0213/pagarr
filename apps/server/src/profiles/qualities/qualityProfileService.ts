import type { CustomFormat } from "../customFormat.js";
import type { ProfileFormatItem } from "../profileFormatItem.js";
import type { Quality } from "../../qualities/quality.js";
import { QualityProfileInUseException } from "../errors.js";
import { ALL_QUALITIES, DEFAULT_QUALITY_DEFINITIONS, QUALITY_MOBI, QUALITY_EPUB, QUALITY_AZW3, QUALITY_MP3, QUALITY_M4B, QUALITY_FLAC, QUALITY_UNKNOWN, QUALITY_UNKNOWN_AUDIO } from "./qualityDefaults.js";
import { newQualityProfile, type QualityProfile } from "./qualityProfile.js";
import { newQualityItem, type QualityProfileQualityItem } from "./qualityProfileQualityItem.js";
import type { QualityProfileRepository } from "./qualityProfileRepository.js";

/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityProfileService.cs.
 *
 * Cross-module collaborators (IAuthorService, IImportListFactory,
 * IRootFolderService, ICustomFormatService) belong to modules that haven't
 * been ported yet (Books, ImportLists, RootFolders, CustomFormats -- all
 * later phases per PORT_PLAN.md; Profiles is Phase 1 and can't wait on
 * them). Per PORT_PLAN.md's "plain constructor injection / factory
 * functions" decision, each is narrowed to the minimal read-only query
 * shape this service actually calls, and accepted as an optional
 * constructor param defaulting to "nothing registered yet" -- so `Delete`'s
 * in-use guard and the CustomFormat-sync event handlers behave correctly
 * once real implementations are wired in later, and degrade safely (no
 * false positives) today. NLog's `_logger` is dropped, matching the
 * `configService.ts` precedent (no Instrumentation module yet; nothing here
 * needs logging to behave correctly).
 */
export interface AuthorProfileUsageLookup {
  /** Ported from IAuthorService.GetAllAuthors() as used by Delete()'s in-use check. */
  getAllAuthors(): { qualityProfileId: number }[];
}

export interface ImportListProfileUsageLookup {
  /** Ported from IImportListFactory.All() as used by Delete()'s in-use check. */
  all(): { profileId: number }[];
}

export interface RootFolderProfileUsageLookup {
  /** Ported from IRootFolderService.All() as used by Delete()'s in-use check. */
  all(): { defaultQualityProfileId: number }[];
}

export interface CustomFormatLookup {
  /** Ported from ICustomFormatService.All() as used by GetDefaultProfile(). */
  all(): CustomFormat[];
}

const noAuthors: AuthorProfileUsageLookup = { getAllAuthors: () => [] };
const noImportLists: ImportListProfileUsageLookup = { all: () => [] };
const noRootFolders: RootFolderProfileUsageLookup = { all: () => [] };
const noCustomFormats: CustomFormatLookup = { all: () => [] };

export interface QualityProfileServiceDeps {
  authorService?: AuthorProfileUsageLookup;
  importListFactory?: ImportListProfileUsageLookup;
  rootFolderService?: RootFolderProfileUsageLookup;
  customFormatService?: CustomFormatLookup;
}

export class QualityProfileService {
  private readonly authorService: AuthorProfileUsageLookup;
  private readonly importListFactory: ImportListProfileUsageLookup;
  private readonly rootFolderService: RootFolderProfileUsageLookup;
  private readonly customFormatService: CustomFormatLookup;

  constructor(
    private readonly profileRepository: QualityProfileRepository,
    deps: QualityProfileServiceDeps = {}
  ) {
    this.authorService = deps.authorService ?? noAuthors;
    this.importListFactory = deps.importListFactory ?? noImportLists;
    this.rootFolderService = deps.rootFolderService ?? noRootFolders;
    this.customFormatService = deps.customFormatService ?? noCustomFormats;
  }

  add(profile: QualityProfile): QualityProfile {
    return this.profileRepository.insert(profile);
  }

  update(profile: QualityProfile): void {
    this.profileRepository.update(profile);
  }

  /** Ported from QualityProfileService.Delete(int id): throws if any dependent still references this profile. */
  delete(id: number): void {
    const inUse =
      this.authorService.getAllAuthors().some((a) => a.qualityProfileId === id) ||
      this.importListFactory.all().some((l) => l.profileId === id) ||
      this.rootFolderService.all().some((r) => r.defaultQualityProfileId === id);

    if (inUse) {
      const profile = this.profileRepository.get(id);
      throw new QualityProfileInUseException(profile.name);
    }

    this.profileRepository.delete(id);
  }

  all(): QualityProfile[] {
    return this.profileRepository.all();
  }

  get(id: number): QualityProfile {
    return this.profileRepository.get(id);
  }

  exists(id: number): boolean {
    return this.profileRepository.exists(id);
  }

  /**
   * Ported from QualityProfileService.Handle(ApplicationStartedEvent): seeds
   * the "eBook" and "Spoken" default quality profiles the first time the
   * app starts with none configured. No-op if any profile already exists.
   */
  handleApplicationStarted(): void {
    if (this.all().length > 0) {
      return;
    }

    this.addDefaultProfile("eBook", QUALITY_MOBI, QUALITY_MOBI, QUALITY_EPUB, QUALITY_AZW3);

    this.addDefaultProfile(
      "Spoken",
      QUALITY_MP3,
      QUALITY_UNKNOWN_AUDIO,
      QUALITY_MP3,
      QUALITY_M4B,
      QUALITY_FLAC
    );
  }

  /**
   * Ported from QualityProfileService.Handle(CustomFormatAddedEvent): every
   * existing profile gets a new zero-score FormatItem prepended for the
   * newly added CustomFormat.
   */
  handleCustomFormatAdded(customFormat: CustomFormat): void {
    for (const profile of this.all()) {
      profile.formatItems.unshift({ score: 0, format: customFormat });
      this.update(profile);
    }
  }

  /**
   * Ported from QualityProfileService.Handle(CustomFormatDeletedEvent):
   * removes the deleted CustomFormat's FormatItem from every profile, and
   * if that leaves a profile with no FormatItems left, resets its score
   * thresholds to 0 (mirrors the "hack for empty format lists" reset in the
   * C# source).
   */
  handleCustomFormatDeleted(customFormat: CustomFormat): void {
    for (const profile of this.all()) {
      profile.formatItems = profile.formatItems.filter((c) => c.format.id !== customFormat.id);

      if (profile.formatItems.length === 0) {
        profile.minFormatScore = 0;
        profile.cutoffFormatScore = 0;
      }

      this.update(profile);
    }
  }

  /**
   * Ported from QualityProfileService.GetDefaultProfile(string name,
   * Quality cutoff, params Quality[] allowed). Groups the fixed quality
   * definitions by GroupWeight (see qualityDefaults.ts), builds one
   * QualityProfileQualityItem per group (a bare leaf item for singleton
   * groups, a named group item with nested leaf items otherwise), and
   * assigns Cutoff to either the matching Quality's own id or its
   * containing group's synthetic id (starting at 1000, incrementing per
   * group) -- exactly mirroring the C# groupId bookkeeping.
   */
  getDefaultProfile(name: string, cutoff: Quality | null = null, ...allowed: Quality[]): QualityProfile {
    const groups = groupByWeight(DEFAULT_QUALITY_DEFINITIONS);
    const items: QualityProfileQualityItem[] = [];
    let groupId = 1000;
    let profileCutoff = cutoff === null ? QUALITY_UNKNOWN.id : cutoff.id;

    const allowedIds = new Set(allowed.map((a) => a.id));

    for (const group of groups) {
      if (group.length === 1) {
        const quality = group[0]!.quality;
        items.push(newQualityItem({ quality, allowed: allowedIds.has(quality.id) }));
        continue;
      }

      const groupAllowed = group.some((g) => allowedIds.has(g.quality.id));

      items.push(
        newQualityItem({
          id: groupId,
          // QualityDefinition.GroupName has no default population in the
          // ported static data (Quality.cs's DefaultQualityDefinitions
          // never sets it) -- group.First().GroupName is always empty for
          // every current definition, ported faithfully as empty here too.
          name: group[0]!.groupName ?? "",
          items: group.map((g) => newQualityItem({ quality: g.quality, allowed: groupAllowed })),
          allowed: groupAllowed,
        })
      );

      if (group.some((s) => s.quality.id === profileCutoff)) {
        profileCutoff = groupId;
      }

      groupId++;
    }

    const formatItems: ProfileFormatItem[] = this.customFormatService.all().map((format) => ({
      score: 0,
      format,
    }));

    return newQualityProfile({
      name,
      cutoff: profileCutoff,
      items,
      minFormatScore: 0,
      cutoffFormatScore: 0,
      formatItems,
    });
  }

  private addDefaultProfile(name: string, cutoff: Quality, ...allowed: Quality[]): QualityProfile {
    const profile = this.getDefaultProfile(name, cutoff, ...allowed);
    return this.add(profile);
  }
}

/**
 * Ported from `Quality.DefaultQualityDefinitions.GroupBy(q => q.GroupWeight)`:
 * groups preserving first-seen order of each distinct GroupWeight (matching
 * LINQ GroupBy's documented "preserves order of first appearance of each
 * key" semantics -- C#'s underlying HashSet<QualityDefinition> enumerates
 * in insertion order in practice for a set with no removals, so this is a
 * faithful reproduction of the observed grouping order).
 */
function groupByWeight(
  definitions: typeof DEFAULT_QUALITY_DEFINITIONS
): (typeof DEFAULT_QUALITY_DEFINITIONS)[] {
  const order: number[] = [];
  const byWeight = new Map<number, typeof DEFAULT_QUALITY_DEFINITIONS>();

  for (const def of definitions) {
    let bucket = byWeight.get(def.groupWeight);
    if (!bucket) {
      bucket = [];
      byWeight.set(def.groupWeight, bucket);
      order.push(def.groupWeight);
    }
    bucket.push(def);
  }

  return order.map((w) => byWeight.get(w) as typeof DEFAULT_QUALITY_DEFINITIONS);
}

export { ALL_QUALITIES };
