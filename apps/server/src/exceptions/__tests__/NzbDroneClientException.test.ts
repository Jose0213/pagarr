import { describe, expect, it } from "vitest";
import { NzbDroneClientException } from "../NzbDroneClientException.js";

describe("NzbDroneClientException", () => {
  it("carries statusCode and message", () => {
    const error = new NzbDroneClientException(400, "Bad request");

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Bad request");
    expect(error.name).toBe("NzbDroneClientException");
  });

  it("is an instanceof Error and itself", () => {
    const error = new NzbDroneClientException(500, "Server error");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(NzbDroneClientException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new NzbDroneClientException(400, "wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
