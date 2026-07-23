/**
 * Ported from NzbDrone.Core/Qualities/Revision.cs.
 *
 * C# `Revision` is a small value object with `Version`/`Real`/`IsRepack`
 * plus `IEquatable<Revision>` and `IComparable<Revision>` (backing the
 * `>`, `<`, `>=`, `<=`, `==`, `!=` operators exercised directly by
 * RevisionComparableFixture.cs). TypeScript has no operator overloading, so
 * the operators are ported as plain methods (`greaterThan`, `lessThan`,
 * etc.) plus `compareTo`/`equals`, and `revisionsEqual` free functions for
 * the `==`/`!=` semantics (which, unlike the instance methods, must also
 * handle `null`/`undefined` operands the way C#'s static operators did).
 */

export interface RevisionOptions {
  version?: number;
  real?: number;
  isRepack?: boolean;
}

export class Revision {
  version: number;
  real: number;
  isRepack: boolean;

  constructor(options: RevisionOptions = {}) {
    this.version = options.version ?? 1;
    this.real = options.real ?? 0;
    this.isRepack = options.isRepack ?? false;
  }

  /** Ported from `Revision.Equals(Revision other)`: compares Version + Real only (not IsRepack). */
  equals(other: Revision | null | undefined): boolean {
    if (other === null || other === undefined) {
      return false;
    }

    return this.version === other.version && this.real === other.real;
  }

  /** Ported from `Revision.CompareTo(Revision other)`: Real first, then Version. */
  compareTo(other: Revision): number {
    if (this.real > other.real) {
      return 1;
    }

    if (this.real < other.real) {
      return -1;
    }

    if (this.version > other.version) {
      return 1;
    }

    if (this.version < other.version) {
      return -1;
    }

    return 0;
  }

  /** Ported from `Revision.ToString()`: "v{Version}" plus " Real:{Real}" when Real > 0. */
  toString(): string {
    let result = `v${this.version}`;

    if (this.real > 0) {
      result += ` Real:${this.real}`;
    }

    return result;
  }
}

/**
 * Ported from `Revision.operator >`. C#'s null-aware operator semantics:
 * null is "less than" any non-null instance, and null > null is false.
 */
export function revisionGreaterThan(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  if (left === null || left === undefined) {
    return false;
  }

  if (right === null || right === undefined) {
    return true;
  }

  return left.compareTo(right) > 0;
}

/** Ported from `Revision.operator <`. */
export function revisionLessThan(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  if (left === null || left === undefined) {
    return true;
  }

  if (right === null || right === undefined) {
    return false;
  }

  return left.compareTo(right) < 0;
}

/** Ported from `Revision.operator >=`. */
export function revisionGreaterThanOrEqual(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  if (left === null || left === undefined) {
    return false;
  }

  if (right === null || right === undefined) {
    return true;
  }

  return left.compareTo(right) >= 0;
}

/** Ported from `Revision.operator <=`. */
export function revisionLessThanOrEqual(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  if (left === null || left === undefined) {
    return true;
  }

  if (right === null || right === undefined) {
    return false;
  }

  return left.compareTo(right) <= 0;
}

/** Ported from `Revision.operator ==`: null-safe reference/value equality. */
export function revisionsEqual(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }

  return left.equals(right);
}

/** Ported from `Revision.operator !=`. */
export function revisionsNotEqual(
  left: Revision | null | undefined,
  right: Revision | null | undefined
): boolean {
  return !revisionsEqual(left, right);
}
