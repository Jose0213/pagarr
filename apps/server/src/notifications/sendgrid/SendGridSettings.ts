/**
 * Ported from NzbDrone.Core/Notifications/SendGrid/SendGridSettings.cs.
 * See `email/EmailSettings.ts`'s doc comment for the FluentValidation ->
 * hand-rolled `validate()` substitution rationale (same across every
 * notifier settings type ported in this worktree).
 */
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

export interface SendGridSettings extends IProviderConfig {
  baseUrl: string;
  apiKey: string;
  from: string;
  recipients: string[];
}

/** Ported from SendGridSettings's parameterless constructor defaults. */
export function createSendGridSettings(
  overrides: Partial<SendGridSettings> = {}
): SendGridSettings {
  return {
    baseUrl: "https://api.sendgrid.com/v3/",
    apiKey: "",
    from: "",
    recipients: [],
    validate(): ValidationResult {
      return validateSendGridSettings(this);
    },
    ...overrides,
  };
}

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Ported from SendGridSettingsValidator. */
export function validateSendGridSettings(settings: SendGridSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.apiKey) {
    errors.push({ propertyName: "apiKey", errorMessage: "'Api Key' must not be empty." });
  }

  if (!settings.from) {
    errors.push({ propertyName: "from", errorMessage: "'From' must not be empty." });
  } else if (!EMAIL_ADDRESS_RE.test(settings.from)) {
    errors.push({ propertyName: "from", errorMessage: "'From' is not a valid email address." });
  }

  if (settings.recipients.length === 0) {
    errors.push({ propertyName: "recipients", errorMessage: "'Recipients' must not be empty." });
  }

  for (const recipient of settings.recipients) {
    if (!recipient || !EMAIL_ADDRESS_RE.test(recipient)) {
      errors.push({
        propertyName: "recipients",
        errorMessage: `'${recipient}' is not a valid email address.`,
      });
    }
  }

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}
