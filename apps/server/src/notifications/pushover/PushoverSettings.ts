import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";
import { PushoverPriority } from "./PushoverPriority.js";

/**
 * Ported from NzbDrone.Core/Notifications/Pushover/PushoverSettings.cs.
 * FluentValidation -> plain-function deviation (see join/JoinSettings.ts's
 * doc comment for the established precedent).
 */
export interface PushoverSettings extends IProviderConfig {
  apiKey: string;
  userKey: string;
  devices: string[];
  priority: number;
  retry: number;
  expire: number;
  sound: string;
}

/** Ported from PushoverSettings's default ctor: `Priority = 0`, `Devices = new string[] {}`. */
export function createPushoverSettings(
  overrides: Partial<PushoverSettings> = {}
): PushoverSettings {
  return {
    apiKey: "",
    userKey: "",
    devices: [],
    priority: 0,
    retry: 0,
    expire: 0,
    sound: "",
    validate(): ValidationResult {
      return validatePushoverSettings(this);
    },
    ...overrides,
  };
}

/**
 * Ported from PushoverSettingsValidator. NOTE: the real C# validator
 * declares the `Retry` rule TWICE -- both instances gated on `Priority ==
 * Emergency`, the second one (`GreaterThanOrEqualTo(0).LessThanOrEqualTo
 * (86400)`) is a strictly looser duplicate of the first
 * (`GreaterThanOrEqualTo(30).LessThanOrEqualTo(86400)`) and never
 * validates `Expire` at all despite the field existing and being sent to
 * the API. This looks like a copy-paste bug (the second rule was clearly
 * meant to target `c.Expire`) but is preserved faithfully per this port's
 * "known bugs get fixed later, separately" rule -- `Expire` has NO
 * validation rule here, matching the real validator's actual behavior.
 */
export function validatePushoverSettings(settings: PushoverSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!settings.userKey || settings.userKey.trim() === "") {
    errors.push({ propertyName: "UserKey", errorMessage: "'User Key' must not be empty." });
  }

  const isEmergency = settings.priority === PushoverPriority.Emergency;

  if (isEmergency) {
    // First RuleFor(c => c.Retry): 30-86400.
    if (settings.retry < 30 || settings.retry > 86400) {
      errors.push({
        propertyName: "Retry",
        errorMessage: "'Retry' must be between 30 and 86400.",
      });
    }

    // Second RuleFor(c => c.Retry): 0-86400 (duplicate/bugged rule, see doc
    // comment above -- kept faithfully, so this can only ever ADD a
    // failure when Retry is negative, which the first rule already caught
    // via its own >= 30 floor. Preserved as its own check for fidelity
    // with the real validator running both rules independently.)
    if (settings.retry < 0 || settings.retry > 86400) {
      errors.push({
        propertyName: "Retry",
        errorMessage: "'Retry' must be between 0 and 86400.",
      });
    }
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}

/** Ported from `PushoverSettings.IsValid`. */
export function isPushoverSettingsValid(settings: PushoverSettings): boolean {
  return (
    !!settings.userKey &&
    settings.userKey.trim() !== "" &&
    settings.priority >= -1 &&
    settings.priority <= 2
  );
}
