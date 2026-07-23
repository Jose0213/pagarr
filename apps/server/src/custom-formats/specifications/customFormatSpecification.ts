import type { CustomFormatInput } from "../customFormatInput.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/Specifications/ICustomFormatSpecification.cs.
 *
 * `NzbDroneValidationResult`/`Validate()` come from the not-yet-ported
 * Validation module (NzbDrone.Core/Validation/, built on FluentValidation --
 * neither is ported yet, no Phase 0/1 module owns them per PORT_PLAN.md; see
 * `profiles/delay/delayProfileTagInUseValidator.ts` for the identical
 * precedent of dropping the FluentValidation-backed return type). `validate()`
 * here returns a minimal `ValidationResult` shape (`isValid` + `errors`)
 * carrying the same information `NzbDroneValidationResult` would -- a real
 * Validation module can replace this without changing what each
 * specification's `validate()` body computes.
 */
export interface ValidationFailure {
  propertyName: string;
  errorMessage: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationFailure[];
}

export function validResult(): ValidationResult {
  return { isValid: true, errors: [] };
}

export function invalidResult(errors: ValidationFailure[]): ValidationResult {
  return { isValid: errors.length === 0, errors };
}

export interface ICustomFormatSpecification {
  readonly order: number;
  readonly infoLink: string;
  readonly implementationName: string;
  name: string;
  negate: boolean;
  required: boolean;

  validate(): ValidationResult;
  clone(): ICustomFormatSpecification;
  isSatisfiedBy(input: CustomFormatInput): boolean;
}

/**
 * Ported from NzbDrone.Core/CustomFormats/Specifications/CustomFormatSpecificationBase.cs.
 *
 * `MemberwiseClone()` (a shallow field-by-field copy) becomes a shallow
 * object spread in `clone()` -- equivalent for these specification classes,
 * none of which hold reference-typed mutable state beyond their own scalar
 * fields (`_regex`/`_raw` on RegexSpecificationBase are recreated from
 * `value`, not copied, by `withValue`/the `value` setter equivalent -- see
 * that file). Each concrete subclass still needs its own `clone()` override
 * so the returned object is the concrete subtype (TS has no `MemberwiseClone`
 * that "just works" polymorphically without knowing the concrete shape);
 * this base class provides a `cloneInto` helper subclasses call instead of
 * duplicating the negate/required/name copy in every leaf.
 */
export abstract class CustomFormatSpecificationBase implements ICustomFormatSpecification {
  abstract readonly order: number;
  abstract readonly implementationName: string;

  /** Ported from `CustomFormatSpecificationBase.InfoLink` (virtual, same default in every current subclass). */
  readonly infoLink: string = "https://wiki.servarr.com/readarr/settings#custom-formats-2";

  name = "";
  negate = false;
  required = false;

  abstract validate(): ValidationResult;
  abstract clone(): ICustomFormatSpecification;

  /** Ported from `CustomFormatSpecificationBase.IsSatisfiedBy(CustomFormatInput input)`: applies `Negate` to the subclass's raw match result. */
  isSatisfiedBy(input: CustomFormatInput): boolean {
    const match = this.isSatisfiedByWithoutNegate(input);
    return this.negate ? !match : match;
  }

  protected abstract isSatisfiedByWithoutNegate(input: CustomFormatInput): boolean;
}
