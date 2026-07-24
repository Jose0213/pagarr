/**
 * Barrel export for the HTTP API module -- port of Readarr.Http/*.cs,
 * NzbDrone.SignalR/*.cs, and the generic provider-CRUD slice of
 * Readarr.Api.V1/*.cs (ProviderControllerBase.cs/ProviderResource.cs/
 * ProviderBulkResource.cs/ApplyTags.cs). This is the Phase 5 composition
 * root: every real resource controller (Books, Indexers, DownloadClients,
 * Notifications, ImportLists, Queue, Config, System, Health, Logs, etc.)
 * is built ON TOP of this module in the next dispatch, not IN it -- see
 * this worktree's final report for the full file-by-file breakdown, the
 * exact `restController`/`providerControllerBase` factory signatures, and
 * what a Phase 5 agent needs to know to use them correctly.
 */

export * from "./app.js";

export * from "./rest/RestResource.js";
export * from "./rest/ResourceValidator.js";
export * from "./rest/RestController.js";
export * from "./rest/RestControllerWithSignalR.js";
export * from "./rest/BadRequestException.js";
export * from "./rest/NotFoundException.js";
export * from "./rest/MethodNotAllowedException.js";
export * from "./rest/UnsupportedMediaTypeException.js";
export * from "./rest/ApplyTags.js";
export * from "./rest/ProviderResource.js";
export * from "./rest/ProviderBulkResource.js";
export * from "./rest/ProviderControllerBase.js";

export * from "./exceptions/ApiException.js";
export * from "./exceptions/InvalidApiKeyException.js";

export * from "./authentication/apiKeyAuth.js";
export * from "./authentication/ipAddressExtensions.js";

export * from "./error-management/ErrorModel.js";
export * from "./error-management/ReadarrErrorPipeline.js";

export * from "./client-schema/Field.js";
export * from "./client-schema/SelectOption.js";
export * from "./client-schema/FieldMapping.js";
export * from "./client-schema/SchemaBuilder.js";

export * from "./signalr/SignalRMessage.js";
export * from "./signalr/SignalRBroadcaster.js";
