import type { IndexerResponse } from "../IndexerResponse.js";

/**
 * Ported from NzbDrone.Core/Indexers/Exceptions/IndexerException.cs. C#'s
 * `NzbDroneException(string message, params object[] args)` ctor formats
 * `message` with `string.Format` when `args` is non-empty; mirrored here
 * with a plain template-args helper since TS has no `params object[]`
 * format-string convention.
 */
export class IndexerException extends Error {
  readonly response: IndexerResponse;

  constructor(response: IndexerResponse, message: string, ...args: unknown[]) {
    super(args.length > 0 ? formatMessage(message, args) : message);
    this.name = "IndexerException";
    this.response = response;
    Object.setPrototypeOf(this, IndexerException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}
