import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/index.js";
import { isValidUrl } from "../discord/DiscordSettings.js";

/**
 * Ported from NzbDrone.Core/Notifications/Slack/SlackSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation documented on `discord/DiscordSettings.ts`. Reuses that
 * module's `isValidUrl()` helper (the real `IsValidUrl()` FluentValidation
 * extension Slack's C# validator also calls) rather than re-deriving a
 * second copy.
 */
export interface SlackSettings extends IProviderConfig {
  webHookUrl: string;
  username: string;
  icon: string;
  channel: string;
}

export function createSlackSettings(overrides: Partial<SlackSettings> = {}): SlackSettings {
  return {
    webHookUrl: "",
    username: "",
    icon: "",
    channel: "",
    validate(): ValidationResult {
      return validateSlackSettings(this);
    },
    ...overrides,
  };
}

/** Ported from SlackSettingsValidator. */
export function validateSlackSettings(settings: SlackSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidUrl(settings.webHookUrl)) {
    errors.push({
      propertyName: "WebHookUrl",
      errorMessage: `Invalid Url: '${settings.webHookUrl}'`,
    });
  }

  if (!settings.username || settings.username.trim() === "") {
    errors.push({
      propertyName: "Username",
      errorMessage: "'Username' must not be empty.",
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
