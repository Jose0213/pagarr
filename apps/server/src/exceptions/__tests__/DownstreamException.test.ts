import { describe, expect, it } from "vitest";
import { DownstreamException } from "../DownstreamException.js";
import { NzbDroneClientException } from "../NzbDroneClientException.js";

describe("DownstreamException", () => {
  it("carries statusCode and message", () => {
    const error = new DownstreamException(502, "Bad gateway");

    expect(error.statusCode).toBe(502);
    expect(error.message).toBe("Bad gateway");
    expect(error.name).toBe("DownstreamException");
  });

  it("is an instanceof Error and itself, but NOT NzbDroneClientException", () => {
    const error = new DownstreamException(500, "Server error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DownstreamException);
    // The real C# has these as sibling classes under NzbDroneException, not
    // parent/child -- verify the port didn't accidentally nest them.
    expect(error).not.toBeInstanceOf(NzbDroneClientException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new DownstreamException(500, "wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
