/**
 * Ported from NzbDrone.Core/Notifications/Goodreads/Bookshelf/GoodreadsBookshelfNotificationSettings.cs.
 */
import type { ValidationResult } from "../../../thingi-provider/IProviderConfig.js";
import {
  createGoodreadsSettingsBaseFields,
  toValidationResult,
  validateGoodreadsSettingsBase,
  type GoodreadsSettingsBase,
} from "../GoodreadsSettingsBase.js";

export interface GoodreadsBookshelfNotificationSettings extends GoodreadsSettingsBase {
  removeIds: string[];
  addIds: string[];
}

/** Ported from GoodreadsBookshelfNotificationSettings's parameterless constructor. */
export function createGoodreadsBookshelfNotificationSettings(
  overrides: Partial<GoodreadsBookshelfNotificationSettings> = {}
): GoodreadsBookshelfNotificationSettings {
  return {
    ...createGoodreadsSettingsBaseFields(),
    removeIds: [],
    addIds: [],
    validate(): ValidationResult {
      return validateGoodreadsBookshelfNotificationSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from GoodreadsBookshelfNotificationSettingsValidator: the base
 * rules plus `RemoveIds`/`AddIds` each required unless the other has
 * entries (`RuleFor(c => c.RemoveIds).NotEmpty().When(c => !c.AddIds.Any())`
 * and the mirrored rule).
 */
export function validateGoodreadsBookshelfNotificationSettings(
  settings: GoodreadsBookshelfNotificationSettings
): ValidationResult {
  const errors = validateGoodreadsSettingsBase(settings);

  const hasAddIds = settings.addIds.length > 0;
  const hasRemoveIds = settings.removeIds.length > 0;

  if (!hasRemoveIds && !hasAddIds) {
    errors.push({
      propertyName: "removeIds",
      errorMessage: "'Remove from Bookshelves' must not be empty.",
    });
  }

  if (!hasAddIds && !hasRemoveIds) {
    errors.push({
      propertyName: "addIds",
      errorMessage: "'Add to Bookshelves' must not be empty.",
    });
  }

  return toValidationResult(errors);
}
