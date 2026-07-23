/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/OwnedBooks/GoodreadsOwnedBooksNotificationSettings.cs.
 */
import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import {
  createGoodreadsSettingsBaseFields,
  toValidationResult,
  validateGoodreadsSettingsBase,
  type GoodreadsSettingsBase,
} from "../GoodreadsSettingsBase.js";

/** Ported from the OwnedBookCondition enum. */
export enum OwnedBookCondition {
  BrandNew = 10,
  LikeNew = 20,
  VeryGood = 30,
  Good = 40,
  Acceptable = 50,
  Poor = 60,
}

export interface GoodreadsOwnedBooksNotificationSettings extends GoodreadsSettingsBase {
  condition: number;
  description: string | null;
  location: string | null;
}

/** Ported from GoodreadsOwnedBooksNotificationSettings's default `Condition = (int)OwnedBookCondition.BrandNew`. */
export function createGoodreadsOwnedBooksNotificationSettings(
  overrides: Partial<GoodreadsOwnedBooksNotificationSettings> = {}
): GoodreadsOwnedBooksNotificationSettings {
  return {
    ...createGoodreadsSettingsBaseFields(),
    condition: OwnedBookCondition.BrandNew,
    description: null,
    location: null,
    validate(): ValidationResult {
      return validateGoodreadsOwnedBooksNotificationSettings(this);
    },
    ...overrides,
  };
}

/** Ported from GoodreadsSettingsBaseValidator<GoodreadsOwnedBooksNotificationSettings> -- no additional rules beyond the base. */
export function validateGoodreadsOwnedBooksNotificationSettings(
  settings: GoodreadsOwnedBooksNotificationSettings
): ValidationResult {
  return toValidationResult(validateGoodreadsSettingsBase(settings));
}
