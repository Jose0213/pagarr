import type { ProviderStatusBase } from "../status/ProviderStatusBase.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Events/ProviderStatusChangedEvent.cs.
 * See ProviderAddedEvent.ts's doc comment re: the not-yet-ported IEvent bus.
 */
export class ProviderStatusChangedEvent<TStatus extends ProviderStatusBase = ProviderStatusBase> {
  readonly providerId: number;
  readonly status: TStatus;

  constructor(id: number, status: TStatus) {
    this.providerId = id;
    this.status = status;
  }
}
