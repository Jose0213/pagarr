import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/** Ported from NzbDrone.Core/Notifications/PushBullet/PushBulletSettings.cs. */
export interface PushBulletSettings extends IProviderConfig {
  apiKey: string;
  deviceIds: string[];
  channelTags: string[];
  senderId: string;
}

/** Ported from PushBulletSettings's default ctor: `DeviceIds = new string[] {}`, `ChannelTags = new string[] {}`. */
export function createPushBulletSettings(
  overrides: Partial<PushBulletSettings> = {}
): PushBulletSettings {
  return {
    apiKey: "",
    deviceIds: [],
    channelTags: [],
    senderId: "",
    validate(): ValidationResult {
      return validatePushBulletSettings(this);
    },
    ...overrides,
  };
}

/** Ported from PushBulletSettingsValidator: `RuleFor(c => c.ApiKey).NotEmpty()`. */
export function validatePushBulletSettings(settings: PushBulletSettings): ValidationResult {
  const errors: ValidationResult["errors"] = [];

  if (!settings.apiKey || settings.apiKey.trim() === "") {
    errors.push({ propertyName: "ApiKey", errorMessage: "'Api Key' must not be empty." });
  }

  return {
    isValid: errors.length === 0,
    hasWarnings: false,
    errors,
  };
}
