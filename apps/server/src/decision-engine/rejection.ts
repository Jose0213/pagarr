import { RejectionType } from "./rejectionType.js";

/** Ported from NzbDrone.Core/DecisionEngine/Rejection.cs. */
export class Rejection {
  reason: string;
  type: RejectionType;

  constructor(reason: string, type: RejectionType = RejectionType.Permanent) {
    this.reason = reason;
    this.type = type;
  }

  /** Ported from `Rejection.ToString()`: "[{Type}] {Reason}". */
  toString(): string {
    return `[${RejectionType[this.type]}] ${this.reason}`;
  }
}
