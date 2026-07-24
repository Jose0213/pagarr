import type { ProviderResource } from "../../rest/ProviderResource.js";

/**
 * Ported from Readarr.Api.V1/Notifications/NotificationResource.cs.
 *
 * `NotificationResource : ProviderResource<NotificationResource>` adds
 * `Link` plus 14 `OnX` (user-configurable trigger flags) + 15 `SupportsOnX`
 * (capability flags, read-only from the client's perspective -- stamped by
 * `NotificationFactory.setProviderCharacteristicsFor()`, see
 * `notifications/NotificationFactory.ts`) + `TestCommand` (always `null` in
 * the real mapper -- see below). In the real C#, the concrete
 * `NotificationResourceMapper` (a `ProviderResourceMapper` subclass) maps
 * every one of these directly to/from identically-named
 * `NotificationDefinition` fields (see
 * `notifications/NotificationDefinition.ts`, which already has every one of
 * them). This port mirrors that directly via `rest/ProviderResource.ts`'s
 * `extraFieldsProviderResourceMapper()` -- the real `providerControllerBase()`
 * `resourceMapper` extension seam, applied in `NotificationController.ts`.
 * This interface is the pure wire-shape declaration; no mapper logic lives
 * here.
 *
 * `Link` (real C# field, never actually set by `NotificationResourceMapper.
 * ToResource`/`ToModel` -- grep confirms no assignment anywhere in the real
 * source) is included in the wire shape for fidelity but always `null`/
 * absent, matching the real always-unset behavior. `TestCommand` is the
 * same -- declared, never populated.
 */
export interface NotificationResource extends ProviderResource {
  link?: string | null;
  onGrab: boolean;
  onReleaseImport: boolean;
  onUpgrade: boolean;
  onRename: boolean;
  onAuthorAdded: boolean;
  onAuthorDelete: boolean;
  onBookDelete: boolean;
  onBookFileDelete: boolean;
  onBookFileDeleteForUpgrade: boolean;
  onHealthIssue: boolean;
  onDownloadFailure: boolean;
  onImportFailure: boolean;
  onBookRetag: boolean;
  onApplicationUpdate: boolean;
  supportsOnGrab: boolean;
  supportsOnReleaseImport: boolean;
  supportsOnUpgrade: boolean;
  supportsOnRename: boolean;
  supportsOnAuthorAdded: boolean;
  supportsOnAuthorDelete: boolean;
  supportsOnBookDelete: boolean;
  supportsOnBookFileDelete: boolean;
  supportsOnBookFileDeleteForUpgrade: boolean;
  supportsOnHealthIssue: boolean;
  includeHealthWarnings: boolean;
  supportsOnDownloadFailure: boolean;
  supportsOnImportFailure: boolean;
  supportsOnBookRetag: boolean;
  supportsOnApplicationUpdate: boolean;
  testCommand?: string | null;
}

/**
 * Every `NotificationResource` sibling field this controller shuttles
 * through `rest/ProviderResource.ts`'s `extraFieldsProviderResourceMapper()`
 * -- the 14 `OnX` fields are genuinely user-writable (round-tripped both
 * directions); the 15 `SupportsOnX` + `includeHealthWarnings`... wait,
 * `includeHealthWarnings` IS user-writable (a real settings toggle, not a
 * capability flag -- see `NotificationDefinition.ts`'s own doc comment
 * distinguishing it from the `SupportsOnX` group) while the 15
 * `SupportsOnX` flags are read-only (stamped from the live provider
 * instance via `NotificationFactory.setProviderCharacteristicsFor()`,
 * never meaningfully read from an inbound request body). All are still
 * listed here since `extraFieldsProviderResourceMapper()` shuttles them
 * uniformly in both directions regardless of intended read/write direction
 * -- a client POSTing a `supportsOnGrab` value has it silently overwritten
 * by the real capability stamp (`setProviderCharacteristics`, called before
 * every `toResource()`) before the definition is used for anything
 * meaningful, matching the real C# behavior where
 * `SetProviderCharacteristics` always re-stamps those fields server-side
 * after mapping.
 */
export const NOTIFICATION_EXTRA_FIELDS = [
  { key: "onGrab", defaultValue: false },
  { key: "onReleaseImport", defaultValue: false },
  { key: "onUpgrade", defaultValue: false },
  { key: "onRename", defaultValue: false },
  { key: "onAuthorAdded", defaultValue: false },
  { key: "onAuthorDelete", defaultValue: false },
  { key: "onBookDelete", defaultValue: false },
  { key: "onBookFileDelete", defaultValue: false },
  { key: "onBookFileDeleteForUpgrade", defaultValue: false },
  { key: "onHealthIssue", defaultValue: false },
  { key: "onDownloadFailure", defaultValue: false },
  { key: "onImportFailure", defaultValue: false },
  { key: "onBookRetag", defaultValue: false },
  { key: "onApplicationUpdate", defaultValue: false },
  { key: "includeHealthWarnings", defaultValue: false },
  { key: "supportsOnGrab", defaultValue: false },
  { key: "supportsOnReleaseImport", defaultValue: false },
  { key: "supportsOnUpgrade", defaultValue: false },
  { key: "supportsOnRename", defaultValue: false },
  { key: "supportsOnAuthorAdded", defaultValue: false },
  { key: "supportsOnAuthorDelete", defaultValue: false },
  { key: "supportsOnBookDelete", defaultValue: false },
  { key: "supportsOnBookFileDelete", defaultValue: false },
  { key: "supportsOnBookFileDeleteForUpgrade", defaultValue: false },
  { key: "supportsOnHealthIssue", defaultValue: false },
  { key: "supportsOnDownloadFailure", defaultValue: false },
  { key: "supportsOnImportFailure", defaultValue: false },
  { key: "supportsOnBookRetag", defaultValue: false },
  { key: "supportsOnApplicationUpdate", defaultValue: false },
] as const;
