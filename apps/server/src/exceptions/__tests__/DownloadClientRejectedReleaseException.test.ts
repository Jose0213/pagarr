import { describe, expect, it } from "vitest";
import { DownloadClientRejectedReleaseException } from "../DownloadClientRejectedReleaseException.js";
import { ReleaseDownloadException } from "../ReleaseDownloadException.js";
import { makeReleaseInfo } from "./testFixtures.js";

describe("DownloadClientRejectedReleaseException", () => {
  it("carries release and message", () => {
    const release = makeReleaseInfo({ title: "Rejected.Title" });
    const error = new DownloadClientRejectedReleaseException(release, "client rejected release");

    expect(error.release).toBe(release);
    expect(error.message).toBe("client rejected release");
    expect(error.name).toBe("DownloadClientRejectedReleaseException");
  });

  it("is an instanceof ReleaseDownloadException and Error", () => {
    const error = new DownloadClientRejectedReleaseException(
      makeReleaseInfo(),
      "client rejected release"
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ReleaseDownloadException);
    expect(error).toBeInstanceOf(DownloadClientRejectedReleaseException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new DownloadClientRejectedReleaseException(makeReleaseInfo(), "wrapped", {
      cause: inner,
    });

    expect(error.cause).toBe(inner);
  });

  it("is distinguishable from its sibling subclasses via instanceof", () => {
    const error = new DownloadClientRejectedReleaseException(makeReleaseInfo(), "rejected");

    expect(error).toBeInstanceOf(DownloadClientRejectedReleaseException);
    // Sibling subclasses of ReleaseDownloadException must not cross-match.
    expect(error.constructor.name).toBe("DownloadClientRejectedReleaseException");
  });
});
