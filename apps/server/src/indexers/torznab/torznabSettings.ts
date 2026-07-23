import { MINIMUM_SEEDERS } from "../IndexerDefaults.js";
import type { ITorrentIndexerSettings } from "../ITorrentIndexerSettings.js";
import type { ValidationFailure, ValidationResult } from "../IIndexerSettings.js";
import {
  createSeedCriteriaSettings,
  validateSeedCriteriaSettings,
  type SeedCriteriaSettings,
} from "../SeedCriteriaSettings.js";
import {
  createNewznabSettings,
  validateNewznabRulesWithWhitelist,
  type NewznabSettings,
} from "../newznab/newznabSettings.js";

const ADDITIONAL_PARAMETERS_REGEX = /(&.+?=.+?)+/;

/**
 * Ported from TorznabSettingsValidator's `ApiKeyWhiteList = Array.Empty<string>()`
 * -- always empty, meaning Torznab's ApiKey rule effectively never fires
 * (unlike Newznab's populated whitelist). Preserved as-is, not "fixed" to
 * reuse Newznab's whitelist, per this port's faithful-port mandate.
 */
const TORZNAB_API_KEY_WHITELIST: readonly string[] = [];

/**
 * Ported from NzbDrone.Core/Indexers/Torznab/TorznabSettings.cs.
 *
 * `TorznabSettings : NewznabSettings, ITorrentIndexerSettings` -- ported as
 * an interface extending both `NewznabSettings` and `ITorrentIndexerSettings`
 * (TS has no single-inheritance-plus-interface constraint here since
 * `NewznabSettings` itself is already an interface in this port, so plain
 * multiple `extends` reproduces the same combined shape).
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation as newznab/newznabSettings.ts's `validateNewznabSettings` --
 * see that file's doc comment. `TorznabSettingsValidator` in C# has an
 * empty `ApiKeyWhiteList` (`Array.Empty<string>()`), meaning `ApiKey` is
 * effectively never required for Torznab (unlike Newznab's populated
 * whitelist) -- preserved as-is here, not "fixed", per this port's
 * faithful-port mandate.
 */
export interface TorznabSettings extends NewznabSettings, ITorrentIndexerSettings {}

/** Ported from TorznabSettings's default ctor (MinimumSeeders = IndexerDefaults.MINIMUM_SEEDERS). */
export function createTorznabSettings(overrides: Partial<TorznabSettings> = {}): TorznabSettings {
  const base = createNewznabSettings(overrides);

  const settings: TorznabSettings = {
    ...base,
    minimumSeeders: MINIMUM_SEEDERS,
    seedCriteria: createSeedCriteriaSettings(),
    rejectBlocklistedTorrentHashesWhileGrabbing: false,
    ...overrides,
    validate(): ValidationResult {
      return validateTorznabSettings(this);
    },
  };

  return settings;
}

/**
 * Ported from TorznabSettingsValidator. Reuses the BaseUrl/ApiPath/
 * AdditionalParameters/Categories/ApiKey rule bodies via
 * `validateNewznabRulesWithWhitelist` (see that function's doc comment in
 * newznab/newznabSettings.ts), passing Torznab's own empty ApiKey
 * whitelist instead of Newznab's -- `TorznabSettingsValidator` in C#
 * doesn't inherit `NewznabSettingsValidator`, it just happens to define
 * identical rule bodies with a different whitelist constant. Adds the
 * SeedCriteria sub-validator on top.
 */
export function validateTorznabSettings(settings: TorznabSettings): ValidationResult {
  const errors: ValidationFailure[] = validateNewznabRulesWithWhitelist(
    settings,
    TORZNAB_API_KEY_WHITELIST
  );

  const seedCriteriaFailures = validateSeedCriteriaSettings(settings.seedCriteria);
  errors.push(
    ...seedCriteriaFailures.map((f) => ({ ...f, propertyName: `SeedCriteria.${f.propertyName}` }))
  );

  return {
    isValid: !errors.some((f) => !f.isWarning),
    hasWarnings: errors.some((f) => f.isWarning),
    errors,
  };
}

// Kept for readability at call sites that just need "does this look like an
// additional-parameters string" without importing the regex directly.
export function isValidAdditionalParameters(value: string): boolean {
  return ADDITIONAL_PARAMETERS_REGEX.test(value);
}

export type { SeedCriteriaSettings };
