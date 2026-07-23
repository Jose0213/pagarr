import { describe, expect, it } from "vitest";
import {
  readSpecifications,
  writeSpecifications,
} from "../specifications/specificationSerializer.js";
import { ReleaseTitleSpecification } from "../specifications/releaseTitleSpecification.js";
import { ReleaseGroupSpecification } from "../specifications/releaseGroupSpecification.js";
import { SizeSpecification } from "../specifications/sizeSpecification.js";
import { IndexerFlagSpecification } from "../specifications/indexerFlagSpecification.js";
import { IndexerFlags } from "../indexerFlags.js";

describe("specificationSerializer", () => {
  it("round-trips an empty list", () => {
    expect(readSpecifications(writeSpecifications([]))).toEqual([]);
  });

  it("writes a {type, body} wrapper per spec, matching CustomFormatSpecificationListConverter's shape", () => {
    const spec = new ReleaseTitleSpecification();
    spec.name = "Title";
    spec.value = "foo";

    const json = writeSpecifications([spec]);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual([
      {
        type: "ReleaseTitleSpecification",
        body: { name: "Title", negate: false, required: false, value: "foo" },
      },
    ]);
  });

  it("round-trips ReleaseTitleSpecification preserving concrete type and fields", () => {
    const spec = new ReleaseTitleSpecification();
    spec.name = "Title";
    spec.value = "foo";
    spec.negate = true;
    spec.required = true;

    const [result] = readSpecifications(writeSpecifications([spec]));

    expect(result).toBeInstanceOf(ReleaseTitleSpecification);
    expect(result?.name).toBe("Title");
    expect((result as ReleaseTitleSpecification).value).toBe("foo");
    expect(result?.negate).toBe(true);
    expect(result?.required).toBe(true);
  });

  it("round-trips ReleaseGroupSpecification", () => {
    const spec = new ReleaseGroupSpecification();
    spec.name = "Group";
    spec.value = "bar";

    const [result] = readSpecifications(writeSpecifications([spec]));

    expect(result).toBeInstanceOf(ReleaseGroupSpecification);
    expect((result as ReleaseGroupSpecification).value).toBe("bar");
  });

  it("round-trips SizeSpecification's min/max", () => {
    const spec = new SizeSpecification();
    spec.name = "Size";
    spec.min = 1.5;
    spec.max = 3.5;

    const [result] = readSpecifications(writeSpecifications([spec]));

    expect(result).toBeInstanceOf(SizeSpecification);
    expect((result as SizeSpecification).min).toBe(1.5);
    expect((result as SizeSpecification).max).toBe(3.5);
  });

  it("round-trips IndexerFlagSpecification's value", () => {
    const spec = new IndexerFlagSpecification();
    spec.name = "Flag";
    spec.value = IndexerFlags.DoubleUpload;

    const [result] = readSpecifications(writeSpecifications([spec]));

    expect(result).toBeInstanceOf(IndexerFlagSpecification);
    expect((result as IndexerFlagSpecification).value).toBe(IndexerFlags.DoubleUpload);
  });

  it("round-trips multiple specifications of different types preserving order", () => {
    const title = new ReleaseTitleSpecification();
    title.value = "a";
    const size = new SizeSpecification();
    size.min = 0;
    size.max = 1;
    const flag = new IndexerFlagSpecification();
    flag.value = IndexerFlags.Scene;

    const result = readSpecifications(writeSpecifications([title, size, flag]));

    expect(result.map((r) => r.constructor.name)).toEqual([
      "ReleaseTitleSpecification",
      "SizeSpecification",
      "IndexerFlagSpecification",
    ]);
  });

  it("throws for an unknown implementation type on read (analogous to Type.GetType returning null)", () => {
    const json = JSON.stringify([{ type: "NotARealSpecification", body: { name: "x" } }]);
    expect(() => readSpecifications(json)).toThrow(
      /Unknown custom format specification implementation/
    );
  });
});
