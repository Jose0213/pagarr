import { describe, expect, it } from "vitest";
import { ReleaseDownloadException } from "../ReleaseDownloadException.js";
import { ReleaseUnavailableException } from "../ReleaseUnavailableException.js";
import { makeReleaseInfo } from "./testFixtures.js";

describe("ReleaseUnavailableException", () => {
  it("carries release and message", () => {
    const release = makeReleaseInfo({ title: "Gone.Title" });
    const error = new ReleaseUnavailableException(release, "release is gone");

    expect(error.release).toBe(release);
    expect(error.message).toBe("release is gone");
    expect(error.name).toBe("ReleaseUnavailableException");
  });

  it("is an instanceof ReleaseDownloadException and Error", () => {
    const error = new ReleaseUnavailableException(makeReleaseInfo(), "release is gone");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReleaseDownloadException);
    expect(error).toBeInstanceOf(ReleaseUnavailableException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new ReleaseUnavailableException(makeReleaseInfo(), "wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
