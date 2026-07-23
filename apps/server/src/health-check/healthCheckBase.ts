import type { HealthCheck } from "./healthCheck.js";
import type { IProvideHealthCheck } from "./iProvideHealthCheck.js";
import type { ILocalizationService } from "./localizationService.js";

/**
 * Ported from NzbDrone.Core/HealthCheck/HealthCheckBase.cs.
 *
 * C# is an abstract class with a `protected readonly ILocalizationService
 * _localizationService` field (actually declared `public readonly` in the
 * real source -- preserved faithfully below, even though every subclass only
 * ever reads it, since C# subclasses access it via the inherited field, not
 * a getter) and two `virtual` properties defaulting to `true`. Ported as an
 * abstract TS class the same shape; concrete checks `extends HealthCheckBase`
 * and override `check()`, optionally overriding `checkOnStartup`/
 * `checkOnSchedule` as get-only accessors (mirroring C#'s `override bool X
 * => false;` pattern -- see e.g. HealthCheckServiceFixture's `FakeHealthCheck`
 * translation in `__tests__/healthCheckService.test.ts`).
 */
export abstract class HealthCheckBase implements IProvideHealthCheck {
  constructor(public readonly localizationService: ILocalizationService) {}

  abstract check(): HealthCheck | Promise<HealthCheck>;

  get checkOnStartup(): boolean {
    return true;
  }

  get checkOnSchedule(): boolean {
    return true;
  }
}
