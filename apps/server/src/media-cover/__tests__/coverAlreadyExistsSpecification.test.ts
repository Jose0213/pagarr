import { describe, expect, it, vi } from "vitest";
import {
  CoverAlreadyExistsSpecification,
  type DiskProviderLike,
} from "../coverAlreadyExistsSpecification.js";

/** Ported from NzbDrone.Core.Test/MediaCoverTests/CoverExistsSpecificationFixture.cs. */

function diskProviderWithFile(lastWrite: Date, size = 1000): DiskProviderLike {
  return {
    fileExists: vi.fn(() => true),
    fileGetLastWrite: vi.fn(() => lastWrite.getTime()),
    getFileSize: vi.fn(() => size),
  };
}

describe("CoverAlreadyExistsSpecification", () => {
  it("should_return_false_if_file_not_exists", () => {
    const diskProvider: DiskProviderLike = {
      fileExists: () => false,
      fileGetLastWrite: () => 0,
      getFileSize: () => 0,
    };
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(new Date(), 0, "c:\\file.exe")).toBe(false);
  });

  it("should_return_false_if_file_exists_but_different_date", () => {
    const now = new Date();
    const diskProvider = diskProviderWithFile(now);
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000);

    expect(subject.alreadyExists(fiveHoursAgo, 0, "c:\\file.exe")).toBe(false);
  });

  it("should_return_true_if_file_exists_and_same_date_but_no_length_header", () => {
    const givenDate = new Date();
    const diskProvider = diskProviderWithFile(givenDate);
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(givenDate, null, "c:\\file.exe")).toBe(true);
  });

  it("should_return_false_if_file_exists_and_same_date_but_length_header_different", () => {
    const givenDate = new Date();
    const diskProvider = diskProviderWithFile(givenDate, 1000);
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(givenDate, 999, "c:\\file.exe")).toBe(false);
  });

  it("should_return_true_if_file_exists_and_date_header_is_null_but_has_length_header", () => {
    const diskProvider = diskProviderWithFile(new Date(), 1000);
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(null, 1000, "c:\\file.exe")).toBe(true);
  });

  it("should_return_true_if_file_exists_and_date_header_is_different_but_length_header_the_same", () => {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const diskProvider = diskProviderWithFile(oneDayAgo, 1000);
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(now, 1000, "c:\\file.exe")).toBe(true);
  });

  it("should_return_false_if_content_length_is_zero_and_falls_through_to_date_check", () => {
    // C#: `serverContentLength.HasValue && serverContentLength.Value > 0` --
    // a supplied-but-zero content length skips the length branch entirely
    // and falls through to the date check (or false if no date either).
    const diskProvider = diskProviderWithFile(new Date());
    const subject = new CoverAlreadyExistsSpecification(diskProvider);

    expect(subject.alreadyExists(null, 0, "c:\\file.exe")).toBe(false);
  });
});
