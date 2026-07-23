import type { ModelBase } from "../db/model-base.js";
import type { DownloadProtocol } from "./DownloadProtocol.js";
import type { IProviderConfig } from "./IIndexerSettings.js";
import type { IndexerStatus } from "./IndexerStatus.js";

/** Ported from NzbDrone.Core/Indexers/IndexerDefinition.cs's `public const int DefaultPriority`. */
export const DEFAULT_PRIORITY = 25;

/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderDefinition.cs +
 * NzbDrone.Core/Indexers/IndexerDefinition.cs.
 *
 * FORWARD-REFERENCE NARROWING: `IndexerDefinition : ProviderDefinition`,
 * where `ProviderDefinition` is the shared base row shape for every
 * provider kind in the not-yet-ported `NzbDrone.Core.ThingiProvider`
 * module (see IndexerStatus.ts's identical note re: ProviderStatusBase).
 * `ProviderDefinition`'s fields (Name, ImplementationName, Implementation,
 * ConfigContract, Enable, Message, Tags, Settings) are inlined directly
 * onto `IndexerDefinition` here for the same reason -- Indexers is the
 * first provider-kind module ported, so there's no second consumer yet to
 * justify extracting a shared base; a later phase can do that extraction
 * without changing this interface's shape.
 *
 * `ImplementationName`/`Message` (ProviderMessage, from ThingiProvider) are
 * omitted -- ImplementationName is UI-display-only and never read by
 * anything in this module's scope; ProviderMessage is a
 * validate()-produced hint object surfaced by `IndexerBase.Message`, which
 * this port's `IndexerBase` always returns `null` for (see indexerBase.ts),
 * matching the C# base's `public virtual ProviderMessage Message => null;`.
 */
export interface IndexerDefinition extends ModelBase {
  name: string;
  implementation: string;
  configContract: string | null;
  settings: IProviderConfig | null;
  tags: number[];

  enableRss: boolean;
  enableAutomaticSearch: boolean;
  enableInteractiveSearch: boolean;
  downloadClientId: number;
  protocol: DownloadProtocol;
  supportsRss: boolean;
  supportsSearch: boolean;
  priority: number;

  status?: IndexerStatus;
}

/**
 * Ported from IndexerDefinition's default ctor (Priority = DefaultPriority)
 * and ProviderDefinition's (Tags = new HashSet<int>()).
 */
export function createIndexerDefinition(
  overrides: Partial<IndexerDefinition> = {}
): IndexerDefinition {
  return {
    id: 0,
    name: "",
    implementation: "",
    configContract: null,
    settings: null,
    tags: [],
    enableRss: false,
    enableAutomaticSearch: false,
    enableInteractiveSearch: false,
    downloadClientId: 0,
    protocol: 0,
    supportsRss: false,
    supportsSearch: false,
    priority: DEFAULT_PRIORITY,
    ...overrides,
  };
}

/**
 * Ported from IndexerDefinition.Enable (get-only override):
 * `EnableRss || EnableAutomaticSearch || EnableInteractiveSearch`.
 */
export function isIndexerDefinitionEnabled(definition: IndexerDefinition): boolean {
  return (
    definition.enableRss || definition.enableAutomaticSearch || definition.enableInteractiveSearch
  );
}
