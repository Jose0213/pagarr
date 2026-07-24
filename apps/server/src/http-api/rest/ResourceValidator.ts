import type { ValidationFailure } from "../../validation/validationResult.js";

/**
 * Ported from Readarr.Http/REST/ResourceValidator.cs.
 *
 * C#'s `ResourceValidator<TResource> : AbstractValidator<TResource>` is a
 * FluentValidation subclass adding one extra capability
 * (`RuleForField<TProperty>`, validating a named entry inside a resource's
 * `Fields: List<Field>` client-schema array -- see
 * client-schema/SchemaBuilder.ts) on top of the full FluentValidation rule
 * DSL (`RuleFor(...).NotEmpty()`, `.Must(...)`, etc). This port has no
 * FluentValidation equivalent DSL; every already-ported validator in this
 * codebase (see validation/ruleHelpers.ts, indexers/*Settings.ts) instead
 * expresses a validator as a plain function `(resource) => ValidationFailure[]`.
 *
 * `ResourceValidator<TResource>` here is that same plain-function shape,
 * kept as a named type (rather than inlining `(r: TResource) =>
 * ValidationFailure[]` at every call site) purely so `restController()`'s
 * options object reads the same as the real C# `RestController<TResource>`'s
 * `PostValidator`/`PutValidator`/`SharedValidator` properties it replaces.
 * `ruleForField()` below is the direct port of `RuleForField`: given a
 * resource's `fields` array and a field name, look up that field's current
 * `value` -- callers build small validator functions out of it exactly as
 * C# callers built `RuleForField<string>(r => r.Fields, "host").NotEmpty()`
 * rules (see provider settings controllers in Phase 5, e.g. a "test
 * connection" host/port check against a provider's client-schema Fields
 * array, not this module's own concern to fill in).
 */
export type ResourceValidator<TResource> = (resource: TResource) => ValidationFailure[];

/** A validator that never produces failures -- the default for any of `restController()`'s three validator slots that a caller doesn't supply. */
export function noopValidator<TResource>(): ResourceValidator<TResource> {
  return () => [];
}

/** Combines multiple validators into one, concatenating all their failures (order preserved). */
export function combineValidators<TResource>(
  ...validators: ResourceValidator<TResource>[]
): ResourceValidator<TResource> {
  return (resource) => validators.flatMap((validate) => validate(resource));
}

interface FieldLike {
  name: string;
  value?: unknown;
}

/**
 * Ported from ResourceValidator.RuleForField's private `GetValue` helper:
 * looks up the single field entry matching `fieldName` in the list returned
 * by `fieldListAccessor`, returning its `value` (or `undefined` if no such
 * field exists -- matches C#'s `SingleOrDefault(...)?.Value`).
 */
export function getFieldValue<TResource, TField extends FieldLike>(
  resource: TResource,
  fieldListAccessor: (resource: TResource) => TField[] | undefined,
  fieldName: string
): unknown {
  const fields = fieldListAccessor(resource) ?? [];
  const matches = fields.filter((f) => f.name === fieldName);

  if (matches.length > 1) {
    throw new Error(`Sequence contains more than one matching element for field "${fieldName}"`);
  }

  return matches[0]?.value;
}
