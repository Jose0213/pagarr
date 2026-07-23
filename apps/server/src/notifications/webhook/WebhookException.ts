/** Ported from NzbDrone.Core/Notifications/Webhook/WebhookException.cs. Same `{ args, cause }` options convention as this module's other exception ports -- note the C# ctor signature here is `(message, innerException, args)`, i.e. it always takes a cause, unlike the sibling notifiers' exceptions. */
export class WebhookException extends Error {
  constructor(message: string, options: { args?: unknown[]; cause?: unknown } = {}) {
    const { args = [], cause } = options;
    super(args.length > 0 ? formatMessage(message, args) : message, { cause });
    this.name = "WebhookException";
    Object.setPrototypeOf(this, WebhookException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}
