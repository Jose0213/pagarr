import type { CustomFormatInput } from "../customFormatInput.js";
import { RegexSpecificationBase } from "./regexSpecificationBase.js";
import type { ICustomFormatSpecification } from "./customFormatSpecification.js";

/** Ported from NzbDrone.Core/CustomFormats/Specifications/ReleaseTitleSpecification.cs. */
export class ReleaseTitleSpecification extends RegexSpecificationBase {
  override readonly order = 1;
  override readonly implementationName = "Release Title";

  protected override isSatisfiedByWithoutNegate(input: CustomFormatInput): boolean {
    return this.matchString(input.bookInfo?.releaseTitle) || this.matchString(input.filename);
  }

  override clone(): ICustomFormatSpecification {
    const copy = new ReleaseTitleSpecification();
    copy.name = this.name;
    copy.negate = this.negate;
    copy.required = this.required;
    copy.value = this.value;
    return copy;
  }
}
