/**
 * Ported from NzbDrone.Core/Validation/{NzbDroneValidationFailure,
 * NzbDroneValidationResult,NzbDroneValidationState,
 * NzbDroneValidationExtensions}.cs.
 *
 * DEVIATION -- shape reuse: this port already has a `ValidationFailure`/
 * `ValidationResult` pair (indexers/IIndexerSettings.ts) independently
 * re-derived from this exact C# module (see that file's own doc comment,
 * and indexers/newznab/newznabSettings.ts's "DEVIATION -- validation" note)
 * by earlier phases that needed *some* validation-result shape before this
 * module existed. Rather than introduce a second, parallel
 * `NzbDroneValidationResult`-named type that every validator in this module
 * would need reconciling against later, this file ports the *behavior*
 * NzbDroneValidationResult/NzbDroneValidationFailure add on top of a plain
 * FluentValidation `ValidationResult` -- warning/error partitioning,
 * `Filter()`, `ThrowOnError()`, `HasErrors()` -- as free functions over the
 * existing `ValidationFailure[]`/`ValidationResult` shape, so this module's
 * validators return exactly what every already-ported settings validator
 * already returns. `IsWarning`/`DetailedDescription` on
 * `NzbDroneValidationFailure` map onto `ValidationFailure`'s existing
 * `isWarning`/`detailedDescription` fields (already present in
 * IIndexerSettings.ts). `InfoLink` (a UI-only "learn more" URL,
 * never read by any validator's own logic) is not ported -- no validator in
 * this module sets it, and IIndexerSettings.ts's `ValidationFailure` has no
 * slot for it; add one there if a future notification/UI-facing validator
 * needs it.
 */
import type { ValidationFailure, ValidationResult } from "../indexers/IIndexerSettings.js";

export type { ValidationFailure, ValidationResult };

/**
 * Ported from NzbDroneValidationState. C#'s `WithState(v =>
 * NzbDroneValidationState.Warning)` stamps a failure as a warning via
 * FluentValidation's generic `CustomState` bag; this port has no such
 * generic bag, so validators just set `isWarning: true` directly on the
 * `ValidationFailure` they construct (see RuleBuilderExtensions.asWarning
 * below for the equivalent "add a warning" helper).
 */
export const WARNING_STATE = { isWarning: true } as const;

/**
 * Ported from NzbDroneValidationResult's constructor logic: partitions raw
 * failures into `errors`/`warnings`, `Failures` (errors first, then
 * warnings, C#'s `errors.Concat(warnings)`), and `IsValid` (true iff no
 * non-warning failures exist -- matches `HasErrors()`'s
 * `item is not NzbDroneValidationFailure { IsWarning: true }` check, i.e. a
 * failure with `isWarning` unset/false counts as a real error).
 */
export function buildValidationResult(failures: ValidationFailure[]): ValidationResult {
  const errors = failures.filter((f) => !f.isWarning);
  const warnings = failures.filter((f) => f.isWarning);

  return {
    isValid: errors.length === 0,
    hasWarnings: warnings.length > 0,
    // Ported from NzbDroneValidationResult.Failures: errors before warnings,
    // not necessarily original push order.
    errors: [...errors, ...warnings],
  };
}

/** Ported from NzbDroneValidationExtensions.HasErrors(). */
export function hasErrors(failures: ValidationFailure[]): boolean {
  return failures.some((f) => !f.isWarning);
}

/** Ported from NzbDroneValidationExtensions.Filter(): keep only failures for the given property names. */
export function filterValidationResult(
  result: ValidationResult,
  ...fields: string[]
): ValidationResult {
  return buildValidationResult(result.errors.filter((f) => fields.includes(f.propertyName)));
}

/**
 * Ported from NzbDroneValidationExtensions.ThrowOnError(). C# throws
 * FluentValidation's `ValidationException`; this port has no such type
 * pre-existing in the codebase's shared exception hierarchy (Exceptions is
 * a separate, already-ported Phase 4 Wave 1 module -- see
 * apps/server/src/exceptions/), so this throws a plain `Error` carrying the
 * same failures for callers to inspect.
 */
export class ValidationException extends Error {
  constructor(public readonly errors: ValidationFailure[]) {
    super(errors.map((e) => e.errorMessage).join(", "));
    this.name = "ValidationException";
  }
}

export function throwOnError(result: ValidationResult): void {
  if (!result.isValid) {
    throw new ValidationException(result.errors);
  }
}
