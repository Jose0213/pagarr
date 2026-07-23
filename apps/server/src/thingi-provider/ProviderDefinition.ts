import type { ModelBase } from "../db/model-base.js";
import type { IProviderConfig } from "./IProviderConfig.js";
import type { ProviderMessage } from "./ProviderMessage.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderDefinition.cs.
 *
 * This is the real, generic base every provider-kind's own definition type
 * (IndexerDefinition, DownloadClientDefinition, MetadataDefinition,
 * CustomFormat's own analog, and -- once ported -- NotificationDefinition)
 * conceptually extends in C#: `public abstract class ProviderDefinition :
 * ModelBase`. The four sibling modules already merged into this repo
 * (Indexers/DownloadClients/CustomFormats/Extras) each independently
 * inlined this shape directly onto their own definition interface rather
 * than extending a shared base, since ThingiProvider hadn't landed yet when
 * they were ported -- see e.g. `indexers/IndexerDefinition.ts`'s doc
 * comment. They are NOT retrofitted to extend this interface (out of scope
 * per this task's brief); this is provided as the real base for
 * Notifications (the last not-yet-ported provider-kind module) to extend
 * going forward.
 *
 * `TProviderConfig` mirrors C#'s `IProviderConfig Settings` property typed
 * per concrete subclass via the actual settings type in real usage (C#
 * itself doesn't generic-parameterize `ProviderDefinition` -- `Settings` is
 * declared as the non-generic `IProviderConfig` there, and concrete
 * consumers just cast). This TS port adds the generic parameter (defaulting
 * to `IProviderConfig`) so a concrete provider-kind module gets a
 * strongly-typed `settings` field for free when it extends this interface,
 * which is strictly more useful than the C# shape without changing runtime
 * behavior.
 *
 * The C# `Settings` property setter has a side effect: assigning a non-null
 * value stamps `ConfigContract = value.GetType().Name` (reflection-derived
 * class name). TS has no runtime type name for a plain object/interface
 * value, so that side effect can't be replicated inside a property setter
 * here -- `setProviderDefinitionSettings()` below is the ported equivalent,
 * taking the config-contract name explicitly as a parameter instead of
 * deriving it via reflection (same "explicit over reflection" pattern this
 * task's brief calls for elsewhere, e.g. provider-type discovery).
 */
export interface ProviderDefinition<
  TProviderConfig extends IProviderConfig = IProviderConfig,
> extends ModelBase {
  name: string;
  /** UI-display-only (set by ProviderFactory.SetProviderCharacteristics from the live instance's Name). */
  implementationName: string;
  implementation: string;
  configContract: string | null;
  enable: boolean;
  message: ProviderMessage | null;
  tags: number[];
  settings: TProviderConfig | null;
}

/** Ported from ProviderDefinition's ctor: `Tags = new HashSet<int>()`. */
export function createProviderDefinition<TProviderConfig extends IProviderConfig = IProviderConfig>(
  overrides: Partial<ProviderDefinition<TProviderConfig>> = {}
): ProviderDefinition<TProviderConfig> {
  return {
    id: 0,
    name: "",
    implementationName: "",
    implementation: "",
    configContract: null,
    enable: false,
    message: null,
    tags: [],
    settings: null,
    ...overrides,
  };
}

/**
 * Ported from ProviderDefinition.Settings's setter side effect (see this
 * file's doc comment): assigns `settings` and, if non-null, stamps
 * `configContract` from the supplied contract name -- the explicit-param
 * substitute for C#'s `value.GetType().Name` reflection.
 */
export function setProviderDefinitionSettings<TProviderConfig extends IProviderConfig>(
  definition: ProviderDefinition<TProviderConfig>,
  settings: TProviderConfig | null,
  configContractName?: string
): void {
  definition.settings = settings;
  if (settings !== null && configContractName !== undefined) {
    definition.configContract = configContractName;
  }
}
