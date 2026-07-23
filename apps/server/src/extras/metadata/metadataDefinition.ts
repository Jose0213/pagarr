import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/MetadataDefinition.cs +
 * NzbDrone.Core/ThingiProvider/ProviderDefinition.cs.
 *
 * FORWARD-REFERENCE NARROWING: `MetadataDefinition : ProviderDefinition`
 * adds no fields of its own -- same "inline the not-yet-ported
 * ThingiProvider base's fields directly" approach as
 * indexers/IndexerDefinition.ts (see that file's doc comment for the full
 * rationale). Backing table: Metadata (see db/migrations/0001_initial_setup.sql
 * -- Id/Enable/Name/Implementation/Settings/ConfigContract columns already
 * exist, no new migration needed).
 *
 * `Tags`/`Message`/`ImplementationName` (ProviderDefinition fields) are
 * omitted: Metadata providers are never tag-filtered or given a UI
 * validation "Message" hint anywhere in the real C# source (unlike
 * Indexers), and ImplementationName is UI-display-only.
 */
export interface MetadataDefinition extends ModelBase {
  name: string;
  implementation: string;
  configContract: string | null;
  settings: Record<string, unknown> | null;
  enable: boolean;
}

export function createMetadataDefinition(
  overrides: Partial<MetadataDefinition> = {}
): MetadataDefinition {
  return {
    id: 0,
    name: "",
    implementation: "",
    configContract: null,
    settings: null,
    enable: false,
    ...overrides,
  };
}
