import { describe, expect, it } from "vitest";
import { AuthorNotFoundException } from "../AuthorNotFoundException.js";

describe("AuthorNotFoundException", () => {
  it("builds the default message from foreignAuthorId", () => {
    const error = new AuthorNotFoundException("oL123A");

    expect(error.foreignAuthorId).toBe("oL123A");
    expect(error.message).toBe(
      "Author with id oL123A was not found, it may have been removed from the metadata server."
    );
    expect(error.name).toBe("AuthorNotFoundException");
  });

  it("accepts a custom message while still storing foreignAuthorId", () => {
    const error = new AuthorNotFoundException("oL123A", "custom message");

    expect(error.foreignAuthorId).toBe("oL123A");
    expect(error.message).toBe("custom message");
  });

  it("is an instanceof Error and itself", () => {
    const error = new AuthorNotFoundException("oL123A");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AuthorNotFoundException);
  });
});
