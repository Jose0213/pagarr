/**
 * Ported from NzbDrone.Core/Notifications/Mailgun/MailgunSettings.cs.
 * See `email/EmailSettings.ts`'s doc comment for the FluentValidation ->
 * hand-rolled `validate()` substitution rationale.
 */
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

export interface MailgunSettings extends IProviderConfig {
  apiKey: string;
  useEuEndpoint: boolean;
  from: string;
  senderDomain: string;
  recipients: string[];
}

/** Ported from MailgunSettings's parameterless constructor defaults. */
export function createMailgunSettings(overrides: Partial<MailgunSettings> = {}): MailgunSettings {
  return {
    apiKey: "",
    useEuEndpoint: false,
    from: "",
    senderDomain: "",
    recipients: [],
    validate(): ValidationResult {
      return validateMailgunSettings(this);
    },
    ...overrides,
  };
}

/** Ported from MailGunSettingsValidator. */
export function validateMailgunSettings(settings: MailgunSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.apiKey) {
    errors.push({ propertyName: "apiKey", errorMessage: "'Api Key' must not be empty." });
  }

  if (!settings.from) {
    errors.push({ propertyName: "from", errorMessage: "'From' must not be empty." });
  }

  if (settings.recipients.length === 0) {
    errors.push({ propertyName: "recipients", errorMessage: "'Recipients' must not be empty." });
  }

  return { isValid: errors.length === 0, hasWarnings: false, errors };
}
