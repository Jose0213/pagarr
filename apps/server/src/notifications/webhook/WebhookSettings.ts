import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";
import { WebhookMethod } from "./WebhookMethod.js";

/**
 * Ported from NzbDrone.Core/Notifications/Webhook/WebhookSettings.cs.
 * DEVIATION -- validation: same FluentValidation-to-plain-function deviation
 * as this module's other settings ports.
 */
export interface WebhookSettings extends IProviderConfig {
  url: string;
  method: number;
  username: string;
  password: string;
}

/** Ported from WebhookSettings's default ctor (Method = (int)WebhookMethod.POST). */
export function createWebhookSettings(overrides: Partial<WebhookSettings> = {}): WebhookSettings {
  return {
    url: "",
    method: WebhookMethod.POST,
    username: "",
    password: "",
    validate(): ValidationResult {
      return validateWebhookSettings(this);
    },
    ...overrides,
  };
}

/** Ported from IsValidUrl() -- a practical stand-in matching this port's established convention (see e.g. WebhookSettingsValidator's other siblings' isValidHost/isValidUrlBase helpers). */
function isValidUrl(url: string | null | undefined): boolean {
  if (url === null || url === undefined || url.trim() === "") {
    return false;
  }
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/** Ported from WebhookSettingsValidator: Url must be a valid URL. */
export function validateWebhookSettings(settings: WebhookSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!isValidUrl(settings.url)) {
    errors.push({ propertyName: "Url", errorMessage: "Invalid URL" });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
