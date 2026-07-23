import { describe, expect, it } from "vitest";
import { ReleaseBlockedException } from "../ReleaseBlockedException.js";
import { ReleaseDownloadException } from "../ReleaseDownloadException.js";
import { makeReleaseInfo } from "./testFixtures.js";

describe("ReleaseBlockedException", () => {
  it("carries release and message", () => {
    const release = makeReleaseInfo({ title: "Blocked.Title" });
    const error = new ReleaseBlockedException(release, "release is blocked");

    expect(error.release).toBe(release);
    expect(error.message).toBe("release is blocked");
    expect(error.name).toBe("ReleaseBlockedException");
  });

  it("is an instanceof ReleaseDownloadException and Error", () => {
    const error = new ReleaseBlockedException(makeReleaseInfo(), "release is blocked");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReleaseDownloadException);
    expect(error).toBeInstanceOf(ReleaseBlockedException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new ReleaseBlockedException(makeReleaseInfo(), "wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
