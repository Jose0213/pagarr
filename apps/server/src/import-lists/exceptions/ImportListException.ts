import type { ImportListResponse } from "../ImportListResponse.js";

/**
 * Ported from NzbDrone.Core/ImportLists/Exceptions/ImportListException.cs.
 *
 * `NzbDroneException`'s `params object[] args` + `string.Format`-style
 * constructor overload is ported as an explicit `sprintf`-lite substitution
 * matching the pattern this port's other exception classes already use
 * (e.g. `indexers/exceptions/IndexerException.ts`) -- since none of this
 * module's call sites actually pass format args to this constructor (see
 * `LazyLibrarianImportParser.ts`, the only concrete thrower, which always
 * uses the plain-message overload), the args overload is kept for shape
 * fidelity but is a straightforward pass-through.
 */
export class ImportListException extends Error {
  readonly response: ImportListResponse;

  constructor(response: ImportListResponse, message: string, ...args: unknown[]) {
    super(args.length > 0 ? formatMessage(message, args) : message);
    this.name = "ImportListException";
    this.response = response;
    Object.setPrototypeOf(this, ImportListException.prototype);
  }
}

function formatMessage(message: string, args: unknown[]): string {
  let i = 0;
  return message.replace(/\{\d+\}/g, () => String(args[i++]));
}
