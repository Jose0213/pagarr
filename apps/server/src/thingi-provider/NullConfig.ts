import type { IProviderConfig, ValidationResult } from "./IProviderConfig.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/NullConfig.cs.
 *
 * C# exposed a single static `NullConfig.Instance`. TS has no static
 * singleton-on-class-with-private-ctor idiom as clean as C#'s, so this
 * exports a frozen module-level singleton constant instead -- same
 * "one shared instance" semantics.
 */
export class NullConfig implements IProviderConfig {
  validate(): ValidationResult {
    return { isValid: true, hasWarnings: false, errors: [] };
  }
}

export const NULL_CONFIG_INSTANCE: NullConfig = new NullConfig();
