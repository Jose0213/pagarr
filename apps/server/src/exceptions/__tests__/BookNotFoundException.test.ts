import { describe, expect, it } from "vitest";
import { BookNotFoundException } from "../BookNotFoundException.js";

describe("BookNotFoundException", () => {
  it("builds the default message from foreignBookId (no 'the' before 'metadata server', per real C#)", () => {
    const error = new BookNotFoundException("oL456B");

    expect(error.foreignBookId).toBe("oL456B");
    expect(error.message).toBe(
      "Book with id oL456B was not found, it may have been removed from metadata server."
    );
    expect(error.name).toBe("BookNotFoundException");
  });

  it("accepts a custom message while still storing foreignBookId", () => {
    const error = new BookNotFoundException("oL456B", "custom message");

    expect(error.foreignBookId).toBe("oL456B");
    expect(error.message).toBe("custom message");
  });

  it("is an instanceof Error and itself", () => {
    const error = new BookNotFoundException("oL456B");

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BookNotFoundException);
  });
});
