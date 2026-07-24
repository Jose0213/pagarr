import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import {
  createGoodreadsSettingsBaseFields,
  toValidationResult,
  validateGoodreadsSettingsBase,
  type GoodreadsSettingsBase,
} from "../GoodreadsSettingsBase.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Goodreads/OwnedBooks/GoodreadsOwnedBooks.cs's
 * `GoodreadsOwnedBooksImportListSettings : GoodreadsSettingsBase<...>` --
 * an empty subclass adding no fields/validation rules of its own.
 */
export type GoodreadsOwnedBooksImportListSettings = GoodreadsSettingsBase;

export function createGoodreadsOwnedBooksImportListSettings(
  overrides: Partial<GoodreadsOwnedBooksImportListSettings> = {}
): GoodreadsOwnedBooksImportListSettings {
  const settings: GoodreadsOwnedBooksImportListSettings = {
    ...createGoodreadsSettingsBaseFields(),
    validate(): ValidationResult {
      return toValidationResult(validateGoodreadsSettingsBase(this));
    },
    ...overrides,
  };
  return settings;
}
