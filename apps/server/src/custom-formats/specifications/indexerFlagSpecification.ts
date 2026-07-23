import type { CustomFormatInput } from "../customFormatInput.js";
import { hasIndexerFlag, isDefinedIndexerFlag } from "../indexerFlags.js";
import {
  CustomFormatSpecificationBase,
  invalidResult,
  validResult,
  type ICustomFormatSpecification,
  type ValidationResult,
} from "./customFormatSpecification.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/Specifications/IndexerFlagSpecification.cs.
 *
 * `Value` is a raw `int` in C# (a `[FieldDefinition(..., Type =
 * FieldType.Select, SelectOptions = typeof(IndexerFlags))]`-annotated select
 * field for the not-yet-ported UI schema layer) rather than a typed
 * `IndexerFlags` -- kept as `number` here for the same reason (an arbitrary
 * client-submitted int, validated by `validate()` below, not guaranteed to
 * be one of the enum's members until validated).
 */
export class IndexerFlagSpecification extends CustomFormatSpecificationBase {
  override readonly order = 4;
  override readonly implementationName = "Indexer Flag";

  value = 0;

  protected override isSatisfiedByWithoutNegate(input: CustomFormatInput): boolean {
    return hasIndexerFlag(Number(input.indexerFlags), this.value);
  }

  /** Ported from `IndexerFlagSpecificationValidator`: Value must be non-empty (non-zero) and a defined IndexerFlags member. */
  override validate(): ValidationResult {
    const errors = [];

    if (!this.value) {
      errors.push({ propertyName: "value", errorMessage: "'Value' should not be empty." });
    }

    if (!isDefinedIndexerFlag(this.value)) {
      errors.push({
        propertyName: "value",
        errorMessage: `Invalid indexer flag condition value: ${this.value}`,
      });
    }

    return errors.length > 0 ? invalidResult(errors) : validResult();
  }

  override clone(): ICustomFormatSpecification {
    const copy = new IndexerFlagSpecification();
    copy.name = this.name;
    copy.negate = this.negate;
    copy.required = this.required;
    copy.value = this.value;
    return copy;
  }
}
