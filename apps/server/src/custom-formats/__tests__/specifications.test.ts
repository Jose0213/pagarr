import { describe, expect, it } from "vitest";
import type { CustomFormatInput } from "../customFormatInput.js";
import { IndexerFlags } from "../indexerFlags.js";
import { ReleaseTitleSpecification } from "../specifications/releaseTitleSpecification.js";
import { ReleaseGroupSpecification } from "../specifications/releaseGroupSpecification.js";
import { SizeSpecification } from "../specifications/sizeSpecification.js";
import { IndexerFlagSpecification } from "../specifications/indexerFlagSpecification.js";

function input(overrides: Partial<CustomFormatInput> = {}): CustomFormatInput {
  return {
    bookInfo: null,
    author: null,
    size: 0,
    indexerFlags: 0,
    ...overrides,
  };
}

describe("ReleaseTitleSpecification", () => {
  it("matches against bookInfo.releaseTitle", () => {
    const spec = new ReleaseTitleSpecification();
    spec.value = "SPARKS";

    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "Some.Book.SPARKS" } }))).toBe(
      true
    );
    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "Some.Book.OtherGroup" } }))).toBe(
      false
    );
  });

  it("falls back to filename when bookInfo doesn't match", () => {
    const spec = new ReleaseTitleSpecification();
    spec.value = "SPARKS";

    expect(
      spec.isSatisfiedBy(
        input({ bookInfo: { releaseTitle: "no-match-here" }, filename: "SPARKS.epub" })
      )
    ).toBe(true);
  });

  it("is case-insensitive (RegexOptions.IgnoreCase)", () => {
    const spec = new ReleaseTitleSpecification();
    spec.value = "sparks";

    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "SPARKS" } }))).toBe(true);
  });

  it("negate flips the match result", () => {
    const spec = new ReleaseTitleSpecification();
    spec.value = "SPARKS";
    spec.negate = true;

    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "SPARKS" } }))).toBe(false);
    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "Other" } }))).toBe(true);
  });

  it("returns false when no pattern has been set (no compiled regex)", () => {
    const spec = new ReleaseTitleSpecification();
    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseTitle: "anything" } }))).toBe(false);
  });

  it("validate() fails for an empty pattern", () => {
    const spec = new ReleaseTitleSpecification();
    const result = spec.validate();
    expect(result.isValid).toBe(false);
  });

  it("validate() passes for a non-empty pattern", () => {
    const spec = new ReleaseTitleSpecification();
    spec.value = "foo";
    expect(spec.validate().isValid).toBe(true);
  });

  it("clone() produces an independent copy with the same fields", () => {
    const spec = new ReleaseTitleSpecification();
    spec.name = "Original";
    spec.value = "foo";
    spec.negate = true;
    spec.required = true;

    const clone = spec.clone() as ReleaseTitleSpecification;

    expect(clone).not.toBe(spec);
    expect(clone.name).toBe("Original");
    expect(clone.value).toBe("foo");
    expect(clone.negate).toBe(true);
    expect(clone.required).toBe(true);
    expect(clone.isSatisfiedBy(input({ bookInfo: { releaseTitle: "foo" } }))).toBe(false); // negated
  });

  it("order and implementationName match the C# source", () => {
    const spec = new ReleaseTitleSpecification();
    expect(spec.order).toBe(1);
    expect(spec.implementationName).toBe("Release Title");
  });
});

describe("ReleaseGroupSpecification", () => {
  it("matches against bookInfo.releaseGroup only (not filename)", () => {
    const spec = new ReleaseGroupSpecification();
    spec.value = "SPARKS";

    expect(spec.isSatisfiedBy(input({ bookInfo: { releaseGroup: "SPARKS" } }))).toBe(true);
    expect(
      spec.isSatisfiedBy(input({ bookInfo: { releaseGroup: "Other" }, filename: "SPARKS.epub" }))
    ).toBe(false);
  });

  it("order and implementationName match the C# source", () => {
    const spec = new ReleaseGroupSpecification();
    expect(spec.order).toBe(9);
    expect(spec.implementationName).toBe("Release Group");
  });
});

describe("SizeSpecification", () => {
  it("matches when size is strictly greater than Min and less-than-or-equal to Max (in GB)", () => {
    const spec = new SizeSpecification();
    spec.min = 1;
    spec.max = 2;

    const oneGb = 1024 * 1024 * 1024;

    expect(spec.isSatisfiedBy(input({ size: oneGb }))).toBe(false); // == Min, not > Min
    expect(spec.isSatisfiedBy(input({ size: oneGb + 1 }))).toBe(true); // just above Min
    expect(spec.isSatisfiedBy(input({ size: 2 * oneGb }))).toBe(true); // == Max, inclusive
    expect(spec.isSatisfiedBy(input({ size: 2 * oneGb + 1 }))).toBe(false); // just above Max
  });

  it("validate() requires Min >= 0 and Max > Min", () => {
    const spec = new SizeSpecification();
    spec.min = -1;
    spec.max = 0;
    expect(spec.validate().isValid).toBe(false);

    spec.min = 5;
    spec.max = 5;
    expect(spec.validate().isValid).toBe(false);

    spec.min = 0;
    spec.max = 10;
    expect(spec.validate().isValid).toBe(true);
  });

  it("order and implementationName match the C# source", () => {
    const spec = new SizeSpecification();
    expect(spec.order).toBe(8);
    expect(spec.implementationName).toBe("Size");
  });
});

describe("IndexerFlagSpecification", () => {
  it("matches when the input has the configured flag set (bitwise HasFlag)", () => {
    const spec = new IndexerFlagSpecification();
    spec.value = IndexerFlags.Freeleech;

    expect(spec.isSatisfiedBy(input({ indexerFlags: IndexerFlags.Freeleech }))).toBe(true);
    expect(
      spec.isSatisfiedBy(input({ indexerFlags: IndexerFlags.Freeleech | IndexerFlags.Internal }))
    ).toBe(true);
    expect(spec.isSatisfiedBy(input({ indexerFlags: IndexerFlags.Internal }))).toBe(false);
    expect(spec.isSatisfiedBy(input({ indexerFlags: 0 }))).toBe(false);
  });

  it("validate() rejects zero/undefined and non-enum values", () => {
    const spec = new IndexerFlagSpecification();
    spec.value = 0;
    expect(spec.validate().isValid).toBe(false);

    spec.value = 3; // not a single defined flag value
    expect(spec.validate().isValid).toBe(false);

    spec.value = IndexerFlags.Scene;
    expect(spec.validate().isValid).toBe(true);
  });

  it("order and implementationName match the C# source", () => {
    const spec = new IndexerFlagSpecification();
    expect(spec.order).toBe(4);
    expect(spec.implementationName).toBe("Indexer Flag");
  });
});

describe("infoLink default", () => {
  it("matches CustomFormatSpecificationBase.InfoLink's virtual default for every leaf spec", () => {
    for (const spec of [
      new ReleaseTitleSpecification(),
      new ReleaseGroupSpecification(),
      new SizeSpecification(),
      new IndexerFlagSpecification(),
    ]) {
      expect(spec.infoLink).toBe("https://wiki.servarr.com/readarr/settings#custom-formats-2");
    }
  });
});
