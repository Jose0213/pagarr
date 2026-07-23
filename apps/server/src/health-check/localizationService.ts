/**
 * FORWARD-REFERENCE: `NzbDrone.Core/Localization/ILocalizationService.cs`
 * (`NzbDrone.Core.Localization` namespace) has not been ported by any prior
 * phase -- confirmed by grepping the whole `apps/server/src` tree for
 * "localizationService"/"LocalizationService" (no hits) before writing this
 * file. Every single one of the 37 real C# HealthCheck files depends on it
 * (`ILocalizationService _localizationService` is injected into every
 * `HealthCheckBase` subclass's constructor and called via
 * `GetLocalizedString(key)` -- sometimes with `string.Format` for
 * placeholders) to resolve a translation-table key (e.g.
 * `"ApiKeyValidationHealthCheckMessage"`) to the actual user-facing message
 * string.
 *
 * This is a genuine cross-module dependency this worktree cannot avoid
 * (Localization is not in this task's scope, and porting the whole
 * translation-resource-file-loading module just to unblock HealthCheck would
 * be scope creep beyond "port HealthCheck faithfully"). Narrowed to exactly
 * the one method every check calls: `GetLocalizedString(string
 * translationKey): string`. A `NullLocalizationService` fallback (returning
 * the key itself, unresolved) is provided so every check class stays fully
 * constructible/testable today, matching this port's established "define
 * the seam now, wire the real thing later" convention (see
 * `db/events.ts`'s `NullEventAggregator`, `books/events.ts`'s
 * `NullBooksEventAggregator`). When Localization lands, swap in a real
 * implementation of this interface -- no check class needs to change.
 */
export interface ILocalizationService {
  getLocalizedString(translationKey: string): string;
}

/** Returns the raw key unresolved -- see module doc comment. */
export class NullLocalizationService implements ILocalizationService {
  getLocalizedString(translationKey: string): string {
    return translationKey;
  }
}
