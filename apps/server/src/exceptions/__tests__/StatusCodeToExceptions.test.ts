import { describe, expect, it } from "vitest";
import { BadRequestException } from "../BadRequestException.js";
import { DownstreamException } from "../DownstreamException.js";
import { verifyStatusCode } from "../StatusCodeToExceptions.js";

describe("verifyStatusCode", () => {
  it("throws BadRequestException for 400", () => {
    expect(() => verifyStatusCode(400)).toThrow(BadRequestException);
    try {
      verifyStatusCode(400);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).statusCode).toBe(400);
      // Default message falls back to String(statusCode), per the real C#'s
      // `message = statusCode.ToString()` when no message is passed.
      expect((error as BadRequestException).message).toBe("400");
    }
  });

  it("throws a plain Error named UnauthorizedAccessException for 401", () => {
    try {
      verifyStatusCode(401);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).name).toBe("UnauthorizedAccessException");
      expect((error as Error).message).toBe("401");
    }
  });

  it("throws DownstreamException for 402", () => {
    try {
      verifyStatusCode(402);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DownstreamException);
      expect((error as DownstreamException).statusCode).toBe(402);
    }
  });

  it("throws DownstreamException for 500", () => {
    try {
      verifyStatusCode(500);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DownstreamException);
      expect((error as DownstreamException).statusCode).toBe(500);
    }
  });

  it("uses a custom message when provided", () => {
    try {
      verifyStatusCode(400, "totally bad request");
      expect.unreachable();
    } catch (error) {
      expect((error as BadRequestException).message).toBe("totally bad request");
    }
  });

  it("falls back to statusCode string when message is null or empty", () => {
    try {
      verifyStatusCode(500, null);
      expect.unreachable();
    } catch (error) {
      expect((error as DownstreamException).message).toBe("500");
    }

    try {
      verifyStatusCode(500, "");
      expect.unreachable();
    } catch (error) {
      expect((error as DownstreamException).message).toBe("500");
    }
  });

  it("does not throw for status codes outside the allowlist (e.g. 403, 404, 503)", () => {
    expect(() => verifyStatusCode(403)).not.toThrow();
    expect(() => verifyStatusCode(404)).not.toThrow();
    expect(() => verifyStatusCode(503)).not.toThrow();
    expect(() => verifyStatusCode(200)).not.toThrow();
  });
});
