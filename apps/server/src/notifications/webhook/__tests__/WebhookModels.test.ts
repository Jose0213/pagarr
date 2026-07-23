import { describe, expect, it } from "vitest";
import {
  webhookAuthorFromAuthor,
  webhookBookFromBook,
  webhookBookFileFromBookFile,
} from "../WebhookModels.js";
import { testAuthor, testBook, testBookFile, testEdition } from "../../__tests__/testFixtures.js";

describe("webhookAuthorFromAuthor", () => {
  it("maps id/name/path/goodreadsId from the author's metadata (Author.Name passthrough equivalent)", () => {
    const author = testAuthor({
      id: 5,
      path: "/authors/x",
      metadata: { ...testAuthor().metadata!, name: "Jane Doe", foreignAuthorId: "gr-1" },
    });

    const webhookAuthor = webhookAuthorFromAuthor(author);

    expect(webhookAuthor).toEqual({
      id: 5,
      name: "Jane Doe",
      path: "/authors/x",
      goodreadsId: "gr-1",
    });
  });
});

describe("webhookBookFromBook", () => {
  it("selects the single monitored edition", () => {
    const monitoredEdition = testEdition({ id: 1, monitored: true, title: "Monitored Ed" });
    const book = testBook(testAuthor(), {
      editions: [testEdition({ id: 2, monitored: false }), monitoredEdition],
    });

    const result = webhookBookFromBook(book);

    expect(result.edition?.title).toBe("Monitored Ed");
  });

  it("throws when zero editions are monitored (ported from Single() throwing InvalidOperationException)", () => {
    const book = testBook(testAuthor(), { editions: [testEdition({ monitored: false })] });

    expect(() => webhookBookFromBook(book)).toThrow();
  });

  it("throws when more than one edition is monitored", () => {
    const book = testBook(testAuthor(), {
      editions: [testEdition({ id: 1, monitored: true }), testEdition({ id: 2, monitored: true })],
    });

    expect(() => webhookBookFromBook(book)).toThrow();
  });
});

describe("webhookBookFileFromBookFile", () => {
  it("flattens quality.quality.name and quality.revision.version", () => {
    const bookFile = testBookFile();

    const result = webhookBookFileFromBookFile(bookFile);

    expect(result.quality).toBe(bookFile.quality.quality.name);
    expect(result.qualityVersion).toBe(bookFile.quality.revision.version);
  });
});
