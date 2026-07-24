import type { DownloadProtocol } from "../../../indexers/DownloadProtocol.js";
import type { ProviderResource } from "../../rest/ProviderResource.js";

/**
 * Ported from Readarr.Api.V1/DownloadClient/DownloadClientResource.cs.
 *
 * `DownloadClientResource : ProviderResource<DownloadClientResource>` adds
 * five fields on top of the generic base: `Enable`/`Protocol`/`Priority`/
 * `RemoveCompletedDownloads`/`RemoveFailedDownloads`. In the real C#, the
 * concrete `DownloadClientResourceMapper` (a `ProviderResourceMapper`
 * subclass) maps these directly to/from identically-named
 * `DownloadClientDefinition` fields. This port mirrors that directly via
 * `rest/ProviderResource.ts`'s `extraFieldsProviderResourceMapper()` -- the
 * real `providerControllerBase()` `resourceMapper` extension seam, applied
 * in `DownloadClientController.ts`. This interface is the pure wire-shape
 * declaration; no mapper logic lives here.
 */
export interface DownloadClientResource extends ProviderResource {
  enable: boolean;
  protocol: DownloadProtocol;
  priority: number;
  removeCompletedDownloads: boolean;
  removeFailedDownloads: boolean;
}

/** Ported from `DownloadClientResourceMapper`'s field list -- see this module's doc comment for why the mapping itself lives in the router wrapper, not here. Defaults match `DownloadClientDefinition`'s own ctor defaults (`download-clients/DownloadClientDefinition.ts`). */
export const DOWNLOAD_CLIENT_EXTRA_FIELDS = [
  { key: "enable", defaultValue: false },
  { key: "protocol", defaultValue: 0 satisfies DownloadProtocol },
  { key: "priority", defaultValue: 1 },
  { key: "removeCompletedDownloads", defaultValue: true },
  { key: "removeFailedDownloads", defaultValue: true },
] as const;
