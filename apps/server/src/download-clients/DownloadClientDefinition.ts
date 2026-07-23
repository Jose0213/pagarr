import type { ModelBase } from "../db/model-base.js";
import type { DownloadProtocol } from "../indexers/DownloadProtocol.js";
import type { IProviderConfig } from "../indexers/IIndexerSettings.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderDefinition.cs +
 * NzbDrone.Core/Download/DownloadClientDefinition.cs.
 *
 * FORWARD-REFERENCE NARROWING: `DownloadClientDefinition : ProviderDefinition`,
 * same shared not-yet-ported `ThingiProvider` base indexers/IndexerDefinition.ts
 * inlines -- see that file's doc comment for the full rationale. Its fields
 * (Name, Implementation, ConfigContract, Enable, Message, Tags, Settings)
 * are inlined directly here, same pattern.
 *
 * `IProviderConfig`/`ValidationResult`/`ValidationFailure` are reused
 * directly from `indexers/IIndexerSettings.ts` rather than re-declared --
 * unlike `DownloadProtocol` (which Indexers *owns* and re-exports a real
 * value for), `IProviderConfig` is a `ThingiProvider`-level contract that
 * doesn't conceptually belong to Indexers either; Indexers just happened to
 * be the first module that needed to define it. Reusing that same
 * type/values (rather than declaring a second structurally-identical copy
 * under `download-clients/`) avoids exactly the kind of duplicate-forward-ref
 * drift `decision-engine/remoteBook.ts`'s doc comment calls out being fixed
 * for `DownloadProtocol` at the Phase 2 merge review.
 */
export interface DownloadClientDefinition extends ModelBase {
  name: string;
  implementation: string;
  configContract: string | null;
  settings: IProviderConfig | null;
  tags: number[];
  enable: boolean;

  protocol: DownloadProtocol;
  priority: number;

  removeCompletedDownloads: boolean;
  removeFailedDownloads: boolean;
}

/**
 * Ported from `DownloadClientDefinition`'s default field values
 * (`Priority = 1`, `RemoveCompletedDownloads = true`,
 * `RemoveFailedDownloads = true`) plus `ProviderDefinition`'s
 * (`Tags = new HashSet<int>()`).
 */
export function createDownloadClientDefinition(
  overrides: Partial<DownloadClientDefinition> = {}
): DownloadClientDefinition {
  return {
    id: 0,
    name: "",
    implementation: "",
    configContract: null,
    settings: null,
    tags: [],
    enable: false,
    protocol: 0,
    priority: 1,
    removeCompletedDownloads: true,
    removeFailedDownloads: true,
    ...overrides,
  };
}
