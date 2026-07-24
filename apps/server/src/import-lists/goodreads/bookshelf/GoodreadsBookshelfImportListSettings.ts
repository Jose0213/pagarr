import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import {
  createGoodreadsSettingsBaseFields,
  toValidationResult,
  validateGoodreadsSettingsBase,
  type GoodreadsSettingsBase,
} from "../GoodreadsSettingsBase.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/Bookshelf/GoodreadsBookshelfImportListSettings.cs.
 */
export interface GoodreadsBookshelfImportListSettings extends GoodreadsSettingsBase {
  bookshelfIds: string[];
}

/** Ported from `GoodreadsBookshelfImportListSettings()`'s ctor (`BookshelfIds = new string[] {}`). */
export function createGoodreadsBookshelfImportListSettings(
  overrides: Partial<GoodreadsBookshelfImportListSettings> = {}
): GoodreadsBookshelfImportListSettings {
  const settings: GoodreadsBookshelfImportListSettings = {
    ...createGoodreadsSettingsBaseFields(),
    bookshelfIds: [],
    validate(): ValidationResult {
      return validateGoodreadsBookshelfImportListSettings(this);
    },
    ...overrides,
  };
  return settings;
}

/** Ported from `GoodreadsBookshelfImportListSettingsValidator`: base rules + `RuleFor(c => c.BookshelfIds).NotEmpty()`. */
export function validateGoodreadsBookshelfImportListSettings(
  settings: GoodreadsBookshelfImportListSettings
): ValidationResult {
  const errors = validateGoodreadsSettingsBase(settings);

  if (settings.bookshelfIds.length === 0) {
    errors.push({ propertyName: "bookshelfIds", errorMessage: "'Bookshelves' must not be empty." });
  }

  return toValidationResult(errors);
}
