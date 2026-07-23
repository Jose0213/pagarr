import type { CustomFormatInput } from "../customFormatInput.js";
import {
  CustomFormatSpecificationBase,
  invalidResult,
  validResult,
  type ICustomFormatSpecification,
  type ValidationResult,
} from "./customFormatSpecification.js";

/** Ported from NzbDrone.Core/Fluent.cs's `Gigabytes(this double gigabytes)` extension method. */
function gigabytes(value: number): number {
  return Math.trunc(value * 1024 * 1024 * 1024);
}

/**
 * Ported from NzbDrone.Core/CustomFormats/Specifications/SizeSpecification.cs.
 *
 * `Min`/`Max` are stored as plain GB `double`s and converted to bytes via
 * `.Gigabytes()` only at match time (`IsSatisfiedByWithoutNegate`) -- not
 * cached the way RegexSpecificationBase caches its compiled `Regex`, ported
 * 1:1 the same way (compute on every call, matching C#'s always-recompute
 * behavior for this class specifically).
 */
export class SizeSpecification extends CustomFormatSpecificationBase {
  override readonly order = 8;
  override readonly implementationName = "Size";

  min = 0;
  max = 0;

  protected override isSatisfiedByWithoutNegate(input: CustomFormatInput): boolean {
    const size = input.size;
    return size > gigabytes(this.min) && size <= gigabytes(this.max);
  }

  /** Ported from `SizeSpecificationValidator`: Min >= 0, Max > Min. */
  override validate(): ValidationResult {
    const errors = [];

    if (this.min < 0) {
      errors.push({
        propertyName: "min",
        errorMessage: "'Min' must be greater than or equal to '0'.",
      });
    }

    if (!(this.max > this.min)) {
      errors.push({ propertyName: "max", errorMessage: "'Max' must be greater than 'Min'." });
    }

    return errors.length > 0 ? invalidResult(errors) : validResult();
  }

  override clone(): ICustomFormatSpecification {
    const copy = new SizeSpecification();
    copy.name = this.name;
    copy.negate = this.negate;
    copy.required = this.required;
    copy.min = this.min;
    copy.max = this.max;
    return copy;
  }
}
