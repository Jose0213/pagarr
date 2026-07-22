import { describe, expect, it } from "vitest";
import { InvalidConfigFileError, AccessDeniedConfigFileError } from "../errors.js";

describe("Configuration error types", () => {
  it("InvalidConfigFileError carries a message and optional cause", () => {
    const cause = new Error("underlying");
    const err = new InvalidConfigFileError("config.json is corrupt", cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("InvalidConfigFileError");
    expect(err.message).toBe("config.json is corrupt");
    expect(err.cause).toBe(cause);
  });

  it("AccessDeniedConfigFileError carries a message and optional cause", () => {
    const err = new AccessDeniedConfigFileError("no access");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AccessDeniedConfigFileError");
    expect(err.message).toBe("no access");
    expect(err.cause).toBeUndefined();
  });
});
