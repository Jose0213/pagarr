import {
  CustomFormatSpecificationBase,
  invalidResult,
  validResult,
  type ValidationResult,
} from "./customFormatSpecification.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/Specifications/RegexSpecificationBase.cs.
 *
 * C#'s `Value` property setter eagerly compiles a `Regex` (with
 * `RegexOptions.Compiled | RegexOptions.IgnoreCase`) whenever a
 * non-null-or-whitespace pattern is assigned, caching it in a private
 * `_regex` field alongside the raw string in `_raw`; `MatchString` reuses
 * that cached `Regex` rather than recompiling per call. JS `RegExp` has no
 * direct "compiled" mode, but a `RegExp` object itself is already the
 * reusable compiled form, so the same "compile once on assignment, reuse on
 * every match" shape is preserved via a getter/setter pair on `value` doing
 * the identical lazy-compile-on-write. `RegexOptions.IgnoreCase` maps to the
 * `i` flag.
 *
 * A pattern that fails to compile (invalid regex syntax) throws in both C#
 * (`new Regex(value, ...)` throws `ArgumentException`) and here (`new
 * RegExp(...)` throws `SyntaxError`) -- same failure mode, not caught by
 * either the setter or `validate()` (which only checks for an empty
 * pattern); this is intentional fidelity, not a gap.
 */
export abstract class RegexSpecificationBase extends CustomFormatSpecificationBase {
  private regex: RegExp | undefined;
  private raw: string | null | undefined;

  get value(): string | null | undefined {
    return this.raw;
  }

  set value(v: string | null | undefined) {
    this.raw = v;

    if (v !== null && v !== undefined && v.trim() !== "") {
      this.regex = new RegExp(v, "i");
    }
  }

  /** Ported from `RegexSpecificationBase.MatchString(string compared)`. */
  protected matchString(compared: string | null | undefined): boolean {
    if (compared === null || compared === undefined || this.regex === undefined) {
      return false;
    }

    return this.regex.test(compared);
  }

  /** Ported from `RegexSpecificationBaseValidator`: `Value` must not be empty. */
  override validate(): ValidationResult {
    if (this.raw === null || this.raw === undefined || this.raw.trim() === "") {
      return invalidResult([
        { propertyName: "value", errorMessage: "Regex Pattern must not be empty" },
      ]);
    }

    return validResult();
  }
}
