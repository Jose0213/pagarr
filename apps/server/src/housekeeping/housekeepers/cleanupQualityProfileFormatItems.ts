import type { CustomFormat } from "../../custom-formats/customFormat.js";
import type { ProfileFormatItem } from "../../profiles/profileFormatItem.js";
import type { QualityProfile } from "../../profiles/qualities/qualityProfile.js";
import type { QualityProfileRepository } from "../../profiles/qualities/qualityProfileRepository.js";
import type { IHousekeepingTask } from "../iHousekeepingTask.js";

/**
 * Minimal read surface this task needs from CustomFormatRepository -- see
 * `custom-formats/customFormatRepository.ts`'s real `all()` method, which
 * satisfies this exactly.
 */
export interface CustomFormatLookupForCleanup {
  all(): CustomFormat[];
}

/**
 * Ported from NzbDrone.Core/Housekeeping/Housekeepers/CleanupQualityProfileFormatItems.cs.
 *
 * For every QualityProfile, reconciles its `FormatItems` list against the
 * current set of CustomFormats:
 *   - drops any FormatItem whose CustomFormat has been deleted
 *   - adds a new FormatItem (score 0, inserted at the front) for any
 *     CustomFormat the profile doesn't yet have an entry for
 *
 * Only profiles whose format-id set actually changed (added or removed,
 * order-independent -- via `Except`/set difference) get written back. A
 * profile whose FormatItems end up empty after reconciliation also has its
 * `MinFormatScore`/`CutoffFormatScore` reset to 0 (matching the C# original:
 * `if (profile.FormatItems.Empty()) { profile.MinFormatScore = 0;
 * profile.CutoffFormatScore = 0; }`).
 *
 * `_repository.SetFields(updatedProfiles, p => p.FormatItems, p =>
 * p.MinFormatScore, p => p.CutoffFormatScore)` in C# is a single batched
 * partial-column update. This port's `QualityProfileRepository` (see that
 * file's doc comment -- it deliberately doesn't extend `BasicRepository`
 * because of its JSON columns) has no `setFields`/batched-partial-update
 * method, only a full-row `update()`; since every column
 * `SetFields`/`update()` would touch here (`items`, `formatItems`,
 * `minFormatScore`, `cutoffFormatScore`, plus `name`/`cutoff`/
 * `upgradeAllowed` which SetFields would have left alone) is already
 * present on the in-memory `profile` object read from `all()` moments
 * earlier, a full `update()` per changed profile is behaviorally
 * equivalent here (no other writer runs between the read and this write
 * within a single `clean()` call).
 *
 * The unused `var test = _customFormatRepository.All();` local in the real
 * C# source (its result is discarded, immediately overwritten by the next
 * line's `customFormats` dictionary build from a *second* `.All()` call) is
 * dead code, not ported -- this task calls `customFormatRepository.all()`
 * once, matching the second (actually used) C# call.
 */
export class CleanupQualityProfileFormatItems implements IHousekeepingTask {
  constructor(
    private readonly repository: QualityProfileRepository,
    private readonly customFormatRepository: CustomFormatLookupForCleanup
  ) {}

  clean(): void {
    const customFormats = new Map(this.customFormatRepository.all().map((c) => [c.id, c]));
    const profiles = this.repository.all();
    const updatedProfiles: QualityProfile[] = [];

    for (const profile of profiles) {
      const formatItems: ProfileFormatItem[] = [];

      // Make sure the profile doesn't include formats that have been removed
      for (const item of profile.formatItems) {
        if (item.format !== null && customFormats.has(item.format.id)) {
          formatItems.push(item);
        }
      }

      // Make sure the profile includes all available formats
      for (const [formatId, format] of customFormats) {
        if (!formatItems.some((f) => f.format.id === formatId)) {
          formatItems.unshift({ format, score: 0 });
        }
      }

      const previousIds = profile.formatItems.map((i) => i.format.id);
      const ids = formatItems.map((i) => i.format.id);

      // Update the profile if any formats were added or removed
      const added = ids.filter((id) => !previousIds.includes(id));
      const removed = previousIds.filter((id) => !ids.includes(id));

      if (added.length > 0 || removed.length > 0) {
        const updated: QualityProfile = { ...profile, formatItems };

        if (updated.formatItems.length === 0) {
          updated.minFormatScore = 0;
          updated.cutoffFormatScore = 0;
        }

        updatedProfiles.push(updated);
      }
    }

    for (const profile of updatedProfiles) {
      this.repository.update(profile);
    }
  }
}
