/** Ported from NzbDrone.Core/Notifications/Webhook/WebhookMethod.cs. Numeric values preserved (stored as `WebhookSettings.method: number`, matching the C# `int Method` field backed by this enum's `Convert.ToInt32`). */
export enum WebhookMethod {
  POST = 1,
  PUT = 2,
}
