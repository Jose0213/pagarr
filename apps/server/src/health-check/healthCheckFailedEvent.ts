import type { HealthCheck } from "./healthCheck.js";

/** Ported from NzbDrone.Core/HealthCheck/HealthCheckFailedEvent.cs. */
export class HealthCheckFailedEvent {
  readonly healthCheck: HealthCheck;
  readonly isInStartupGracePeriod: boolean;

  constructor(healthCheck: HealthCheck, isInStartupGracePeriod: boolean) {
    this.healthCheck = healthCheck;
    this.isInStartupGracePeriod = isInStartupGracePeriod;
  }
}
