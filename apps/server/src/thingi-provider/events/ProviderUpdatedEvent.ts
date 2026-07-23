import type { IProviderConfig } from "../IProviderConfig.js";
import type { ProviderDefinition } from "../ProviderDefinition.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/Events/ProviderUpdatedEvent.cs.
 * See ProviderAddedEvent.ts's doc comment re: the not-yet-ported IEvent bus.
 */
export class ProviderUpdatedEvent<TProviderConfig extends IProviderConfig = IProviderConfig> {
  readonly definition: ProviderDefinition<TProviderConfig>;

  constructor(definition: ProviderDefinition<TProviderConfig>) {
    this.definition = definition;
  }
}
