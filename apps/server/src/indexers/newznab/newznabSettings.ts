import type { IIndexerSettings } from "../IIndexerSettings.js";
import type { ValidationFailure, ValidationResult } from "../IIndexerSettings.js";

const API_KEY_WHITELIST: readonly string[] = [
  "nzbs.org",
  "nzb.su",
  "dognzb.cr",
  "nzbplanet.net",
  "nzbid.org",
  "nzbndx.com",
  "nzbindex.in",
];

const ADDITIONAL_PARAMETERS_REGEX = /(&.+?=.+?)+/;

/**
 * Ported from NzbDrone.Core/Indexers/Newznab/NewznabSettings.cs.
 *
 * DEVIATION -- validation: C#'s `NewznabSettingsValidator : AbstractValidator<NewznabSettings>`
 * (FluentValidation) + `ValidUrlBase`/`ValidRootUrl` custom validators (from
 * the not-yet-ported `NzbDrone.Core.Validation` namespace) are ported as a
 * plain `validateNewznabSettings()` function returning this module's own
 * `ValidationFailure[]` shape (see IIndexerSettings.ts) rather than pulling
 * in FluentValidation. Rule behavior (which properties fail, in what order,
 * with what messages) is preserved; only the builder-API mechanism differs.
 */
export interface NewznabSettings extends IIndexerSettings {
  apiPath: string;
  apiKey: string;
  categories: number[];
  additionalParameters: string;
}

/** Ported from NewznabSettings's default ctor (ApiPath = "/api", Categories = { 3030, 7020, 8010 }). */
export function createNewznabSettings(overrides: Partial<NewznabSettings> = {}): NewznabSettings {
  return {
    baseUrl: "",
    apiPath: "/api",
    apiKey: "",
    categories: [3030, 7020, 8010],
    earlyReleaseLimit: null,
    additionalParameters: "",
    validate(): ValidationResult {
      return validateNewznabSettings(this);
    },
    ...overrides,
  };
}

function shouldHaveApiKey(settings: NewznabSettings, whitelist: readonly string[]): boolean {
  if (!settings.baseUrl) {
    return false;
  }
  const lower = settings.baseUrl.toLowerCase();
  return whitelist.some((c) => lower.includes(c));
}

/**
 * Ported from ValidUrlBase()/ValidRootUrl() (Validation extensions): a
 * minimal "must be a non-empty, parseable absolute http(s) URL" check --
 * the same practical rule those FluentValidation extensions enforce for
 * BaseUrl/ApiPath in every indexer settings validator in this module.
 */
function isValidRootUrl(url: string | null | undefined): boolean {
  if (!url || url.trim() === "") {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidUrlBase(path: string | null | undefined): boolean {
  return path === null || path === undefined || path.trim() === "" || path.startsWith("/");
}

/**
 * Ported from the rules `NewznabSettingsValidator`/`TorznabSettingsValidator`
 * share (Categories/BaseUrl/ApiPath/AdditionalParameters/ApiKey), factored
 * out so `torznabSettings.ts`'s `validateTorznabSettings` can reuse them
 * with Torznab's own (empty) ApiKey whitelist instead of Newznab's --
 * `TorznabSettingsValidator` in C# doesn't inherit `NewznabSettingsValidator`
 * (both separately construct their own `AbstractValidator<T>`, just with
 * identical rule bodies apart from the whitelist), so sharing this base
 * function reproduces "same rules, different whitelist" without duplicating
 * the rule logic outright.
 */
function validateSharedNewznabRules(
  settings: NewznabSettings,
  apiKeyWhitelist: readonly string[]
): ValidationFailure[] {
  const errors: ValidationFailure[] = [];

  if (
    settings.categories === undefined ||
    settings.categories === null ||
    settings.categories.length === 0
  ) {
    errors.push({ propertyName: "", errorMessage: "'Categories' must be provided" });
  }

  if (!isValidRootUrl(settings.baseUrl)) {
    errors.push({ propertyName: "BaseUrl", errorMessage: "Invalid root URL" });
  }

  if (!isValidUrlBase(settings.apiPath)) {
    errors.push({
      propertyName: "ApiPath",
      errorMessage: "Invalid URL base, must start with /api",
    });
  }

  if (
    shouldHaveApiKey(settings, apiKeyWhitelist) &&
    (!settings.apiKey || settings.apiKey.trim() === "")
  ) {
    errors.push({ propertyName: "ApiKey", errorMessage: "Must not be empty" });
  }

  if (
    settings.additionalParameters &&
    settings.additionalParameters.trim() !== "" &&
    !ADDITIONAL_PARAMETERS_REGEX.test(settings.additionalParameters)
  ) {
    errors.push({
      propertyName: "AdditionalParameters",
      errorMessage: "Invalid additional parameters",
    });
  }

  return errors;
}

/** Exposed for torznabSettings.ts to reuse with its own ApiKey whitelist -- see validateSharedNewznabRules's doc comment. */
export function validateNewznabRulesWithWhitelist(
  settings: NewznabSettings,
  apiKeyWhitelist: readonly string[]
): ValidationFailure[] {
  return validateSharedNewznabRules(settings, apiKeyWhitelist);
}

/** Ported from NewznabSettingsValidator. */
export function validateNewznabSettings(settings: NewznabSettings): ValidationResult {
  const errors = validateSharedNewznabRules(settings, API_KEY_WHITELIST);

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
