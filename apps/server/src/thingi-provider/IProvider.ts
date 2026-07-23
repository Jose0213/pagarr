import type { IProviderConfig, ValidationResult } from "./IProviderConfig.js";
import type { ProviderDefinition } from "./ProviderDefinition.js";
import type { ProviderMessage } from "./ProviderMessage.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/IProvider.cs.
 *
 * The real base every provider-kind's own instance interface (IIndexer,
 * IDownloadClient, etc.) conceptually extends -- see ProviderDefinition.ts's
 * doc comment for the same "siblings inlined this, not retrofitted" note.
 *
 * `configContract` is typed as `string` here (rather than C#'s `Type
 * ConfigContract`) -- this port has no runtime `Type` object to hand back;
 * every sibling module's own narrowing (e.g. IIndexer.ts's inlined
 * `ConfigContract`) already made the same substitution implicitly by simply
 * not exposing the field on their instance interfaces at all (it's read via
 * `provider.configContract` off the *definition*, not the live instance).
 * This interface keeps it as the config contract's *name* (string) for
 * shape-fidelity with `ProviderDefinition.configContract`, since that's the
 * only representation this port has.
 */
export interface IProvider<TProviderConfig extends IProviderConfig = IProviderConfig> {
  readonly name: string;
  readonly configContract: string;
  readonly message: ProviderMessage | null;
  readonly defaultDefinitions: ProviderDefinition<TProviderConfig>[];
  definition: ProviderDefinition<TProviderConfig>;

  test(): Promise<ValidationResult>;
  requestAction(stage: string, query: Record<string, string>): unknown;
}
