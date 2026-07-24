import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import type { IImportListSettings } from "../../IImportListSettings.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Lists/GoodreadsListImportListSettings.cs.
 * `IImportListSettings` (not `GoodreadsSettingsBase`) -- this is the
 * ID-based, non-OAuth Goodreads settings shape, distinct from
 * Bookshelf/OwnedBooks' OAuth-based settings.
 */
export interface GoodreadsListImportListSettings extends IImportListSettings {
  listId: number;
}

/** Ported from `GoodreadsListImportListSettings()`'s ctor (`BaseUrl = "www.goodreads.com"`). */
export function createGoodreadsListImportListSettings(
  overrides: Partial<GoodreadsListImportListSettings> = {}
): GoodreadsListImportListSettings {
  return {
    baseUrl: "www.goodreads.com",
    listId: 0,
    validate(): ValidationResult {
      return validateGoodreadsListImportListSettings(this);
    },
    ...overrides,
  };
}

/** Ported from `GoodreadsListImportListValidator`: `RuleFor(c => c.ListId).GreaterThan(0)`. */
export function validateGoodreadsListImportListSettings(
  settings: GoodreadsListImportListSettings
): ValidationResult {
  const errors =
    settings.listId > 0
      ? []
      : [{ propertyName: "listId", errorMessage: "'List ID' must be greater than '0'." }];

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}
