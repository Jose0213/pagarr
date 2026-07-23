/**
 * Ported from NzbDrone.Core/DecisionEngine/Decision.cs.
 *
 * C# uses a private constructor + static factory methods (`Accept()`/
 * `Reject(reason, ...args)`) with a single frozen `AcceptDecision` singleton
 * reused by every `Accept()` call. Ported faithfully: `accept()` always
 * returns the same frozen object, `reject()` builds a new one. The
 * `Reject(string reason, params object[] args)` overload (a `string.Format`
 * template) is folded into the single `reject()` below using template
 * literals at each call site instead -- JS has no direct `string.Format`
 * equivalent, and every real call site in Specifications/ just interpolates
 * values inline, so callers here do the same (see e.g.
 * acceptableSizeSpecification.ts).
 */
export class Decision {
  readonly accepted: boolean;
  readonly reason: string | undefined;

  private constructor(accepted: boolean, reason?: string) {
    this.accepted = accepted;
    this.reason = reason;
  }

  private static readonly ACCEPT_DECISION = new Decision(true);

  static accept(): Decision {
    return Decision.ACCEPT_DECISION;
  }

  static reject(reason: string): Decision {
    return new Decision(false, reason);
  }
}
