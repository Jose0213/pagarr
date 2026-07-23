/**
 * Ported from NzbDrone.Core/Notifications/Email/EmailSettings.cs.
 *
 * `NzbDroneValidationResult`/FluentValidation aren't ported (out of scope --
 * see `thingi-provider/IProviderConfig.ts`'s doc comment); `validate()`
 * below hand-implements the same rules `EmailSettingsValidator` declares.
 */
import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/IProviderConfig.js";

export interface EmailSettings extends IProviderConfig {
  server: string;
  port: number;
  requireEncryption: boolean;
  username: string | null;
  password: string | null;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachFiles: boolean;
}

/** Ported from EmailSettings's parameterless constructor defaults. */
export function createEmailSettings(overrides: Partial<EmailSettings> = {}): EmailSettings {
  return {
    server: "smtp.gmail.com",
    port: 587,
    requireEncryption: false,
    username: null,
    password: null,
    from: "",
    to: [],
    cc: [],
    bcc: [],
    attachFiles: false,
    validate(): ValidationResult {
      return validateEmailSettings(this);
    },
    ...overrides,
  };
}

const EMAIL_ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value: string): boolean {
  return EMAIL_ADDRESS_RE.test(value);
}

/**
 * Ported from EmailSettingsValidator. FluentValidation's `.Unless(...)`
 * combinator ("only one of To/Cc/Bcc must be non-empty") is reproduced
 * directly: each of the three rules is skipped when either of the other two
 * already has entries.
 */
export function validateEmailSettings(settings: EmailSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.server) {
    errors.push({ propertyName: "server", errorMessage: "'Server' must not be empty." });
  }

  if (settings.port < 1 || settings.port > 65535) {
    errors.push({
      propertyName: "port",
      errorMessage: "'Port' must be between 1 and 65535.",
    });
  }

  if (!settings.from) {
    errors.push({ propertyName: "from", errorMessage: "'From' must not be empty." });
  }

  for (const address of settings.to) {
    if (!isValidEmail(address)) {
      errors.push({
        propertyName: "to",
        errorMessage: `'${address}' is not a valid email address.`,
      });
    }
  }

  for (const address of settings.cc) {
    if (!isValidEmail(address)) {
      errors.push({
        propertyName: "cc",
        errorMessage: `'${address}' is not a valid email address.`,
      });
    }
  }

  for (const address of settings.bcc) {
    if (!isValidEmail(address)) {
      errors.push({
        propertyName: "bcc",
        errorMessage: `'${address}' is not a valid email address.`,
      });
    }
  }

  const hasTo = settings.to.length > 0;
  const hasCc = settings.cc.length > 0;
  const hasBcc = settings.bcc.length > 0;

  if (!hasTo && !hasCc && !hasBcc) {
    errors.push({ propertyName: "to", errorMessage: "'To' must not be empty." });
    errors.push({ propertyName: "cc", errorMessage: "'Cc' must not be empty." });
    errors.push({ propertyName: "bcc", errorMessage: "'Bcc' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
