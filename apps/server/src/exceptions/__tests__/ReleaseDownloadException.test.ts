import { describe, expect, it } from "vitest";
import { ReleaseDownloadException } from "../ReleaseDownloadException.js";
import { makeReleaseInfo } from "./testFixtures.js";

describe("ReleaseDownloadException", () => {
  it("carries release and message", () => {
    const release = makeReleaseInfo({ title: "Some.Title" });
    const error = new ReleaseDownloadException(release, "download failed");

    expect(error.release).toBe(release);
    expect(error.message).toBe("download failed");
    expect(error.name).toBe("ReleaseDownloadException");
  });

  it("is an instanceof Error and itself", () => {
    const error = new ReleaseDownloadException(makeReleaseInfo(), "download failed");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReleaseDownloadException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new ReleaseDownloadException(makeReleaseInfo(), "wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
