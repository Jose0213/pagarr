import { describe, expect, it } from "vitest";
import { NotSampleSpecification } from "../../specifications/notSampleSpecification.js";
import { makeReleaseInfo, makeRemoteBook } from "../testFixtures.js";

/** No dedicated C# fixture exists for NotSampleSpecification -- new tests covering its documented logic (title contains "sample" AND size < 20MB). */
describe("NotSampleSpecification", () => {
  const subject = new NotSampleSpecification();

  it("rejects a small release with 'sample' in the title", () => {
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({ title: "Some.Book.Sample", size: 10 * 1024 * 1024 }),
    });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("matches case-insensitively", () => {
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({ title: "Some.Book.SAMPLE", size: 10 * 1024 * 1024 }),
    });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(false);
  });

  it("accepts a large release even if titled 'sample'", () => {
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({ title: "Some.Book.Sample", size: 100 * 1024 * 1024 }),
    });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });

  it("accepts a small release without 'sample' in the title", () => {
    const remoteBook = makeRemoteBook({
      release: makeReleaseInfo({ title: "Some.Book.FLAC", size: 10 * 1024 * 1024 }),
    });
    expect(subject.isSatisfiedBy(remoteBook, null).accepted).toBe(true);
  });
});
