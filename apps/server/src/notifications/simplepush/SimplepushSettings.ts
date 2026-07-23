import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/index.js";

/**
 * Ported from NzbDrone.Core/Notifications/Simplepush/SimplepushSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation documented on `discord/DiscordSettings.ts`. `isValid` (the C#
 * `IsValid` computed property, `!string.IsNullOrWhiteSpace(Key)`) is ported
 * as a function rather than a stored/computed interface field, matching
 * this port's established `Ratings.popularity`-style precedent (see
 * `books/models.ts`'s doc comment on `ratingsPopularity()`) for C#
 * computed properties on plain-data shapes.
 */
export interface SimplepushSettings extends IProviderConfig {
  key: string;
  event: string;
}

export function createSimplepushSettings(
  overrides: Partial<SimplepushSettings> = {}
): SimplepushSettings {
  return {
    key: "",
    event: "",
    validate(): ValidationResult {
      return validateSimplepushSettings(this);
    },
    ...overrides,
  };
}

/** Ported from SimplepushSettings.IsValid. */
export function isSimplepushSettingsValid(settings: SimplepushSettings): boolean {
  return !!settings.key && settings.key.trim() !== "";
}

/** Ported from SimplepushSettingsValidator. */
export function validateSimplepushSettings(settings: SimplepushSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.key || settings.key.trim() === "") {
    errors.push({ propertyName: "Key", errorMessage: "'Key' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
