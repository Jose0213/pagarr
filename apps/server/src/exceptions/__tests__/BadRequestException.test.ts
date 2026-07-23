import { describe, expect, it } from "vitest";
import { BadRequestException } from "../BadRequestException.js";
import { DownstreamException } from "../DownstreamException.js";

describe("BadRequestException", () => {
  it("fixes statusCode at 400", () => {
    const error = new BadRequestException("Invalid input");

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Invalid input");
    expect(error.name).toBe("BadRequestException");
  });

  it("is an instanceof DownstreamException and Error", () => {
    const error = new BadRequestException("Invalid input");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DownstreamException);
    expect(error).toBeInstanceOf(BadRequestException);
  });

  it("supports a cause chain", () => {
    const inner = new Error("inner");
    const error = new BadRequestException("wrapped", { cause: inner });

    expect(error.cause).toBe(inner);
  });
});
