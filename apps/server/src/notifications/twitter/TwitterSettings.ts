/**
 * Ported from NzbDrone.Core/Notifications/Twitter/TwitterSettings.cs.
 * See `email/EmailSettings.ts`'s doc comment for the FluentValidation ->
 * hand-rolled `validate()` substitution rationale.
 */
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

export interface TwitterSettings extends IProviderConfig {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
  mention: string | null;
  directMessage: boolean;
  authorizeNotification: string;
}

/** Ported from TwitterSettings's parameterless constructor defaults. */
export function createTwitterSettings(overrides: Partial<TwitterSettings> = {}): TwitterSettings {
  return {
    consumerKey: "",
    consumerSecret: "",
    accessToken: "",
    accessTokenSecret: "",
    mention: null,
    directMessage: true,
    authorizeNotification: "startOAuth",
    validate(): ValidationResult {
      return validateTwitterSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from TwitterSettingsValidator. The C# has a `RuleFor(c =>
 * c.DirectMessage).Equal(true)....AsWarning()` rule -- a *warning*-severity
 * rule urging users toward DirectMessage=true, not an error -- ported here
 * as a `hasWarnings`-flagged entry rather than an `errors` entry, matching
 * `ValidationResult.hasWarnings`'s intended purpose (see
 * `thingi-provider/IProviderConfig.ts`).
 */
export function validateTwitterSettings(settings: TwitterSettings): ValidationResult {
  const errors: ValidationFailure[] = [];
  let hasWarnings = false;

  if (!settings.consumerKey) {
    errors.push({ propertyName: "consumerKey", errorMessage: "'Consumer Key' must not be empty." });
  }

  if (!settings.consumerSecret) {
    errors.push({
      propertyName: "consumerSecret",
      errorMessage: "'Consumer Secret' must not be empty.",
    });
  }

  if (!settings.accessToken) {
    errors.push({ propertyName: "accessToken", errorMessage: "'Access Token' must not be empty." });
  }

  if (!settings.accessTokenSecret) {
    errors.push({
      propertyName: "accessTokenSecret",
      errorMessage: "'Access Token Secret' must not be empty.",
    });
  }

  if (settings.directMessage && !settings.mention) {
    errors.push({ propertyName: "mention", errorMessage: "'Mention' must not be empty." });
  }

  if (!settings.directMessage) {
    hasWarnings = true;
    errors.push({
      propertyName: "directMessage",
      errorMessage: "Using Direct Messaging is recommended, or use a private account.",
      isWarning: true,
    });
  }

  if ((!settings.accessToken || !settings.accessTokenSecret) && settings.authorizeNotification) {
    errors.push({ propertyName: "authorizeNotification", errorMessage: "Authenticate app." });
  }

  return { isValid: errors.filter((e) => !e.isWarning).length === 0, hasWarnings, errors };
}
