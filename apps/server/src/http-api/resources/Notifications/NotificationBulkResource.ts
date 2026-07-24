import type { ProviderBulkResource } from "../../rest/ProviderBulkResource.js";

/**
 * Ported from Readarr.Api.V1/Notifications/NotificationBulkResource.cs:
 *
 * ```
 * public class NotificationBulkResource : ProviderBulkResource<NotificationBulkResource>
 * {
 * }
 *
 * public class NotificationBulkResourceMapper : ProviderBulkResourceMapper<NotificationBulkResource, NotificationDefinition>
 * {
 * }
 * ```
 *
 * Empty subclass -- no extra bulk-editable fields (unlike DownloadClient's
 * `enable`/`priority`/`removeCompletedDownloads`/`removeFailedDownloads`).
 *
 * ## Real C# behavior: bulk routes are DISABLED for Notifications
 *
 * `NotificationController.cs` overrides BOTH bulk actions as `[NonAction]`:
 *
 * ```
 * [NonAction]
 * public override ActionResult<NotificationResource> UpdateProvider([FromBody] NotificationBulkResource providerResource)
 * {
 *     throw new NotImplementedException();
 * }
 *
 * [NonAction]
 * public override object DeleteProviders([FromBody] NotificationBulkResource resource)
 * {
 *     throw new NotImplementedException();
 * }
 * ```
 *
 * `[NonAction]` removes the method from ASP.NET's routing table entirely --
 * `PUT /bulk`/`DELETE /bulk` simply don't exist as routes on the real
 * Notification controller (any request to those paths 404s at the routing
 * layer, never reaching the `NotImplementedException` body at all).
 *
 * This port's `providerControllerBase()` (the shared, already-merged
 * composition root every provider-kind controller in this task's scope
 * builds on) mounts `PUT /bulk`/`DELETE /bulk` UNCONDITIONALLY -- it has no
 * per-controller opt-out flag for disabling specific routes (verified
 * directly against that file: no `mountBulk`/`disableBulk`-shaped option
 * exists in `ProviderControllerOptions`). Since that module is explicitly
 * out of scope to modify for a single controller's quirk (nine sibling
 * agents are building on it in parallel against the same base), this
 * DEVIATION is accepted and documented rather than worked around: this
 * port's `NotificationController` DOES expose working `PUT /bulk`/
 * `DELETE /bulk` routes (using this empty bulk resource, which is harmless
 * -- no extra fields means bulk update is a no-op tag-only operation,
 * exactly matching what the base `defaultUpdateBulkModel` already does),
 * where the real Readarr API would 404. See this task's final report for
 * the explicit callout.
 */
export type NotificationBulkResource = ProviderBulkResource;
