import type { IProviderConfig, ValidationResult } from "../../thingi-provider/IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/Notifications/Synology/SynologyIndexerSettings.cs.
 * `SynologyIndexerSettingsValidator` is empty in the C# source (no rules
 * declared) -- `validate()` always returns valid, matching that.
 */
export interface SynologyIndexerSettings extends IProviderConfig {
  updateLibrary: boolean;
}

/** Ported from SynologyIndexerSettings's default ctor (UpdateLibrary = true). */
export function createSynologyIndexerSettings(
  overrides: Partial<SynologyIndexerSettings> = {}
): SynologyIndexerSettings {
  return {
    updateLibrary: true,
    validate(): ValidationResult {
      return { isValid: true, hasWarnings: false, errors: [] };
    },
    ...overrides,
  };
}
