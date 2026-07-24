import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import type { IImportListSettings } from "../../IImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Series/GoodreadsSeriesImportListSettings.cs.
 */
export interface GoodreadsSeriesImportListSettings extends IImportListSettings {
  seriesId: number;
}

/** Ported from `GoodreadsSeriesImportListSettings()`'s ctor (`BaseUrl = "www.goodreads.com"`). */
export function createGoodreadsSeriesImportListSettings(
  overrides: Partial<GoodreadsSeriesImportListSettings> = {}
): GoodreadsSeriesImportListSettings {
  return {
    baseUrl: "www.goodreads.com",
    seriesId: 0,
    validate(): ValidationResult {
      return validateGoodreadsSeriesImportListSettings(this);
    },
    ...overrides,
  };
}

/** Ported from `GoodreadsSeriesImportListValidator`: `RuleFor(c => c.SeriesId).GreaterThan(0)`. */
export function validateGoodreadsSeriesImportListSettings(
  settings: GoodreadsSeriesImportListSettings
): ValidationResult {
  const errors =
    settings.seriesId > 0
      ? []
      : [{ propertyName: "seriesId", errorMessage: "'Series ID' must be greater than '0'." }];

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}
