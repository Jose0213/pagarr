import type {
  IProviderConfig,
  ValidationFailure,
  ValidationResult,
} from "../../thingi-provider/index.js";

/**
 * Ported from NzbDrone.Core/Notifications/Signal/SignalSettings.cs.
 *
 * DEVIATION -- validation: same FluentValidation-to-plain-function
 * deviation documented on `discord/DiscordSettings.ts`.
 */
export interface SignalSettings extends IProviderConfig {
  host: string;
  port: number;
  useSsl: boolean;
  senderNumber: string;
  receiverId: string;
  authUsername: string;
  authPassword: string;
}

export function createSignalSettings(overrides: Partial<SignalSettings> = {}): SignalSettings {
  return {
    host: "",
    port: 0,
    useSsl: false,
    senderNumber: "",
    receiverId: "",
    authUsername: "",
    authPassword: "",
    validate(): ValidationResult {
      return validateSignalSettings(this);
    },
    ...overrides,
  };
}

/** Ported from SignalSettingsValidator. */
export function validateSignalSettings(settings: SignalSettings): ValidationResult {
  const errors: ValidationFailure[] = [];

  if (!settings.host || settings.host.trim() === "") {
    errors.push({ propertyName: "Host", errorMessage: "'Host' must not be empty." });
  }

  // Ported from `RuleFor(c => c.Port).NotEmpty()` -- FluentValidation's
  // NotEmpty() on a value-type `int` means "not equal to default(int)" (0).
  if (!settings.port) {
    errors.push({ propertyName: "Port", errorMessage: "'Port' must not be empty." });
  }

  if (!settings.senderNumber || settings.senderNumber.trim() === "") {
    errors.push({
      propertyName: "SenderNumber",
      errorMessage: "'Sender Number' must not be empty.",
    });
  }

  if (!settings.receiverId || settings.receiverId.trim() === "") {
    errors.push({
      propertyName: "ReceiverId",
      errorMessage: "'Group ID / PhoneNumber' must not be empty.",
    });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
