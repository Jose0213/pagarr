import type { ProviderResource } from "../../rest/ProviderResource.js";

/**
 * Ported from Readarr.Api.V1/Metadata/MetadataResource.cs.
 *
 * ```
 * public class MetadataResource : ProviderResource<MetadataResource>
 * {
 *     public bool Enable { get; set; }
 * }
 * ```
 *
 * Adds exactly one extra field on top of the generic base. Shuttled to/from
 * the wire via `rest/ProviderResource.ts`'s `extraFieldsProviderResourceMapper()`
 * -- the real `providerControllerBase()` `resourceMapper` extension seam,
 * applied in `MetadataController.ts` -- same as `DownloadClientResource.ts`/
 * `NotificationResource.ts`'s own extra fields.
 */
export interface MetadataResource extends ProviderResource {
  enable: boolean;
}

export const METADATA_EXTRA_FIELDS = [{ key: "enable", defaultValue: false }] as const;
