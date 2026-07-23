/**
 * Ported from NzbDrone.Core/ThingiProvider/Events/ProviderDeletedEvent.cs.
 * See ProviderAddedEvent.ts's doc comment re: the not-yet-ported IEvent bus.
 */
export class ProviderDeletedEvent {
  readonly providerId: number;

  constructor(id: number) {
    this.providerId = id;
  }
}
