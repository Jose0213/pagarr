/**
 * Ported from NzbDrone.Core/Notifications/Webhook/WebhookEventType.cs.
 * C#'s `[JsonConverter(typeof(StringEnumConverter), ...)]` serializes this
 * as its member name (PascalCase, e.g. `"Grab"`) rather than a numeric
 * value -- modeled as a TS string enum so `JSON.stringify` naturally
 * produces the same string values without a custom serializer.
 */
export enum WebhookEventType {
  Test = "Test",
  Grab = "Grab",
  Download = "Download",
  Rename = "Rename",
  AuthorAdded = "AuthorAdded",
  AuthorDelete = "AuthorDelete",
  BookDelete = "BookDelete",
  BookFileDelete = "BookFileDelete",
  Health = "Health",
  Retag = "Retag",
  ApplicationUpdate = "ApplicationUpdate",
}
