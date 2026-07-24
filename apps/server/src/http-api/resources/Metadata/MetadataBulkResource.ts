import type { ProviderBulkResource } from "../../rest/ProviderBulkResource.js";

/**
 * Ported from Readarr.Api.V1/Metadata/MetadataBulkResource.cs:
 *
 * ```
 * public class MetadataBulkResource : ProviderBulkResource<MetadataBulkResource>
 * {
 * }
 *
 * public class MetadataBulkResourceMapper : ProviderBulkResourceMapper<MetadataBulkResource, MetadataDefinition>
 * {
 * }
 * ```
 *
 * Empty subclass -- no extra bulk-editable fields.
 *
 * ## Real C# behavior: bulk routes are DISABLED for Metadata, same as Notifications
 *
 * `MetadataController.cs` overrides BOTH bulk actions as `[NonAction]`,
 * identical shape to `NotificationController.cs` (see
 * `Notifications/NotificationBulkResource.ts`'s doc comment for the full
 * explanation of `[NonAction]`'s routing-table-removal semantics and why
 * this port's shared `providerControllerBase()` cannot reproduce the same
 * 404 behavior without a per-controller route-exclusion option it doesn't
 * have). This port's `MetadataController` therefore exposes working
 * `PUT /bulk`/`DELETE /bulk` routes where the real Readarr API would 404 --
 * an accepted, documented deviation (see this task's final report).
 */
export type MetadataBulkResource = ProviderBulkResource;
