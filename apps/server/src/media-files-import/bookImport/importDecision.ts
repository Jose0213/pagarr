import { Rejection } from "../../decision-engine/rejection.js";

export { Rejection };

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/ImportDecision.cs.
 *
 * Generic over the decided-on item type, exactly like the C# source (used
 * with `LocalBook` and `LocalEdition` throughout this module). `Rejection`
 * is the real, already-ported `decision-engine/rejection.ts` class -- this
 * module is Rejection's own real caller, not a forward-reference.
 */
export class ImportDecision<T> {
  readonly item: T;
  private readonly rejectionsList: Rejection[];

  constructor(item: T, ...rejections: Rejection[]) {
    this.item = item;
    this.rejectionsList = [...rejections];
  }

  /** Ported from `ImportDecision<T>.Rejections` (IList<Rejection>, mutable via Reject()). */
  get rejections(): readonly Rejection[] {
    return this.rejectionsList;
  }

  /** Ported from `ImportDecision<T>.Approved => Rejections.Empty()`. */
  get approved(): boolean {
    return this.rejectionsList.length === 0;
  }

  /** Ported from `ImportDecision<T>.Reject(Rejection rejection)`. */
  reject(rejection: Rejection): void {
    this.rejectionsList.push(rejection);
  }
}
