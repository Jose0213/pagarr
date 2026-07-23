/**
 * Barrel export for the ThingiProvider module -- the generic base every
 * pluggable-provider-kind module (Indexers, DownloadClients, CustomFormats,
 * Extras' metadata registry, and -- once ported -- Notifications) is
 * conceptually modeled after. See this module's task brief / commit
 * history for the full "why a fifth, generic copy" rationale: the four
 * already-merged sibling modules each independently narrowed their own copy
 * of this pattern before this module existed, and are NOT retrofitted to
 * use it (out of scope). This is the real, general base for Notifications
 * (the last not-yet-ported provider-kind module) to converge on.
 */

export * from "./ConfigContractNotFoundException.js";
export * from "./IProvider.js";
export * from "./IProviderConfig.js";
export * from "./IProviderFactory.js";
export * from "./IProviderRepository.js";
export * from "./NullConfig.js";
export * from "./ProviderDefinition.js";
export * from "./ProviderFactory.js";
export * from "./ProviderMessage.js";
export * from "./ProviderRepository.js";

export * from "./events/ProviderAddedEvent.js";
export * from "./events/ProviderDeletedEvent.js";
export * from "./events/ProviderStatusChangedEvent.js";
export * from "./events/ProviderUpdatedEvent.js";

export * from "./status/EscalationBackOff.js";
export * from "./status/ProviderStatusBase.js";
export * from "./status/ProviderStatusRepository.js";
export * from "./status/ProviderStatusServiceBase.js";
