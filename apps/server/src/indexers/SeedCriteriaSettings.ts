/**
 * Ported from NzbDrone.Core/Indexers/SeedCriteriaSettings.cs.
 *
 * FORWARD-REFERENCE NARROWING: `SeedCriteriaSettingsValidator` uses
 * FluentValidation + the not-yet-ported `NzbDrone.Core.Validation`/
 * `NzbDrone.Core.Annotations` namespaces (AsWarning(), FieldDefinition
 * attributes for the settings UI). This port keeps the plain data shape and
 * a hand-rolled `validateSeedCriteriaSettings()` returning this module's own
 * `ValidationFailure[]` shape (see IIndexerSettings.ts), reproducing the
 * same rules/messages/warning-vs-error-severity without FluentValidation's
 * builder API.
 */
export interface SeedCriteriaSettings {
  seedRatio: number | null;
  seedTime: number | null;
  discographySeedTime: number | null;
}

export function createSeedCriteriaSettings(
  overrides: Partial<SeedCriteriaSettings> = {}
): SeedCriteriaSettings {
  return {
    seedRatio: null,
    seedTime: null,
    discographySeedTime: null,
    ...overrides,
  };
}

export interface SeedCriteriaValidationFailure {
  propertyName: "SeedRatio" | "SeedTime" | "DiscographySeedTime";
  errorMessage: string;
  isWarning: true;
}

/**
 * Ported from SeedCriteriaSettingsValidator. All rules in the C# original
 * are `.AsWarning()` -- i.e. they never make the overall settings invalid,
 * only surface a warning message -- so every failure this returns carries
 * `isWarning: true`, matching that behavior.
 */
export function validateSeedCriteriaSettings(
  settings: SeedCriteriaSettings,
  seedRatioMinimum = 0.0,
  seedTimeMinimum = 0,
  discographySeedTimeMinimum = 0
): SeedCriteriaValidationFailure[] {
  const failures: SeedCriteriaValidationFailure[] = [];

  if (settings.seedRatio !== null && !(settings.seedRatio > 0.0)) {
    failures.push({
      propertyName: "SeedRatio",
      errorMessage: "Should be greater than zero",
      isWarning: true,
    });
  }

  if (settings.seedTime !== null && !(settings.seedTime > 0)) {
    failures.push({
      propertyName: "SeedTime",
      errorMessage: "Should be greater than zero",
      isWarning: true,
    });
  }

  if (settings.discographySeedTime !== null && !(settings.discographySeedTime > 0)) {
    failures.push({
      propertyName: "DiscographySeedTime",
      errorMessage: "Should be greater than zero",
      isWarning: true,
    });
  }

  if (
    seedRatioMinimum !== 0.0 &&
    settings.seedRatio !== null &&
    settings.seedRatio > 0.0 &&
    settings.seedRatio < seedRatioMinimum
  ) {
    failures.push({
      propertyName: "SeedRatio",
      errorMessage: `Under ${seedRatioMinimum} leads to H&R`,
      isWarning: true,
    });
  }

  if (
    seedTimeMinimum !== 0 &&
    settings.seedTime !== null &&
    settings.seedTime > 0 &&
    settings.seedTime < seedTimeMinimum
  ) {
    failures.push({
      propertyName: "SeedTime",
      errorMessage: `Under ${seedTimeMinimum} leads to H&R`,
      isWarning: true,
    });
  }

  if (
    discographySeedTimeMinimum !== 0 &&
    settings.discographySeedTime !== null &&
    settings.discographySeedTime > 0 &&
    settings.discographySeedTime < discographySeedTimeMinimum
  ) {
    failures.push({
      propertyName: "DiscographySeedTime",
      errorMessage: `Under ${discographySeedTimeMinimum} leads to H&R`,
      isWarning: true,
    });
  }

  return failures;
}
