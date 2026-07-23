import { Rejection } from "./rejection.js";
import { RejectionType } from "./rejectionType.js";
import { remoteBookToString, type RemoteBook } from "./remoteBook.js";

/**
 * Ported from NzbDrone.Core/DecisionEngine/DownloadDecision.cs.
 *
 * C# exposes `RemoteBook`/`Rejections` as get-only properties set in the
 * constructor (`params Rejection[] rejections`); ported as a plain class
 * with readonly-by-convention fields and a rest-parameter constructor
 * matching the C# `params` signature.
 */
export class DownloadDecision {
  readonly remoteBook: RemoteBook;
  readonly rejections: Rejection[];

  constructor(remoteBook: RemoteBook, ...rejections: Rejection[]) {
    this.remoteBook = remoteBook;
    this.rejections = rejections;
  }

  get approved(): boolean {
    return this.rejections.length === 0;
  }

  get temporarilyRejected(): boolean {
    return (
      this.rejections.length > 0 && this.rejections.every((r) => r.type === RejectionType.Temporary)
    );
  }

  get rejected(): boolean {
    return (
      this.rejections.length > 0 && this.rejections.some((r) => r.type === RejectionType.Permanent)
    );
  }

  /** Ported from `DownloadDecision.ToString()`. */
  toString(): string {
    if (this.approved) {
      return "[OK] " + remoteBookToString(this.remoteBook);
    }

    return "[Rejected " + this.rejections.length + "]" + remoteBookToString(this.remoteBook);
  }
}
