import type { CustomFormatInput } from "../customFormatInput.js";
import { RegexSpecificationBase } from "./regexSpecificationBase.js";
import type { ICustomFormatSpecification } from "./customFormatSpecification.js";

/** Ported from NzbDrone.Core/CustomFormats/Specifications/ReleaseGroupSpecification.cs. */
export class ReleaseGroupSpecification extends RegexSpecificationBase {
  override readonly order = 9;
  override readonly implementationName = "Release Group";

  protected override isSatisfiedByWithoutNegate(input: CustomFormatInput): boolean {
    return this.matchString(input.bookInfo?.releaseGroup);
  }

  override clone(): ICustomFormatSpecification {
    const copy = new ReleaseGroupSpecification();
    copy.name = this.name;
    copy.negate = this.negate;
    copy.required = this.required;
    copy.value = this.value;
    return copy;
  }
}
