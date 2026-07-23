import { describe, expect, it } from "vitest";
import { EditionNotFoundException } from "../EditionNotFoundException.js";

describe("EditionNotFoundException", () => {
  it("builds the default message from foreignEditionId (no 'the' before 'metadata server', per real C#)", () => {
    const error = new EditionNotFoundException("oL789E");

    expect(error.foreignEditionId).toBe("oL789E");
    expect(error.message).toBe(
      "Edition with id oL789E was not found, it may have been removed from metadata server."
    );
    expect(error.name).toBe("EditionNotFoundException");
  });

  it("accepts a custom message while still storing foreignEditionId", () => {
    const error = new EditionNotFoundException("oL789E", "custom message");

    expect(error.foreignEditionId).toBe("oL789E");
    expect(error.message).toBe("custom message");
  });

  it("is an instanceof Error and itself", () => {
    const error = new EditionNotFoundException("oL789E");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(EditionNotFoundException);
  });
});
