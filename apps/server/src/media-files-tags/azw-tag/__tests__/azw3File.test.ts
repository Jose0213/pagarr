import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Azw3File } from "../azw3File.js";
import { AzwTagException } from "../azwTagException.js";
import { buildAzwFile, exthString } from "./testFixture.js";

/**
 * No C# unit test fixture exists for AzwTag/MobiHeader/ExtMeta (checked
 * `src/NzbDrone.Core.Test/` -- there is none), so these are new tests
 * against a synthetic-but-structurally-real MOBI/AZW3 buffer (see
 * testFixture.ts), exercising the actual field offsets AzwFile.cs/
 * MobiHeader.cs/ExtMeta.cs read: title, EXTH string fields (author/isbn/
 * asin/publisher/language/etc via the real IdMapping ids), version-based
 * MOBI-vs-AZW3 quality selection (EbookTagService.cs: `book.Version <= 6 ?
 * Quality.MOBI : Quality.AZW3`), and the error paths (bad top-level ident,
 * bad inner MOBI magic, missing EXTH header).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "azw-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFixture(buffer: Buffer): string {
  const path = join(dir, "book.azw3");
  writeFileSync(path, buffer);
  return path;
}

describe("Azw3File", () => {
  it("reads the title from the MOBI header", () => {
    const path = writeFixture(buildAzwFile({ title: "The Great Test Book" }));
    const book = new Azw3File(path);
    expect(book.title).toBe("The Great Test Book");
  });

  it("reads EXTH string fields by their real IdMapping ids", () => {
    const path = writeFixture(
      buildAzwFile({
        exthRecords: [
          exthString(100, "Jane Author"),
          exthString(104, "9781455546176"),
          exthString(113, "B00ABCDEFG"),
          exthString(101, "Acme Publishing"),
          exthString(102, "Acme Imprint"),
          exthString(103, "A thrilling description."),
          exthString(112, "Some Source"),
          exthString(524, "eng"),
        ],
      })
    );

    const book = new Azw3File(path);
    expect(book.author).toBe("Jane Author");
    expect(book.authors).toEqual(["Jane Author"]);
    expect(book.isbn).toBe("9781455546176");
    expect(book.asin).toBe("B00ABCDEFG");
    expect(book.publisher).toBe("Acme Publishing");
    expect(book.imprint).toBe("Acme Imprint");
    expect(book.description).toBe("A thrilling description.");
    expect(book.source).toBe("Some Source");
    expect(book.language).toBe("eng");
  });

  it("returns an empty list for authors and null for missing fields when no EXTH records are present", () => {
    const path = writeFixture(buildAzwFile({ exthRecords: [] }));
    const book = new Azw3File(path);
    expect(book.authors).toEqual([]);
    expect(book.author).toBeNull();
    expect(book.isbn).toBeNull();
  });

  it("collects multiple creator (id 100) records into Authors, but Author is only the first", () => {
    const path = writeFixture(
      buildAzwFile({
        exthRecords: [exthString(100, "First Author"), exthString(100, "Second Author")],
      })
    );

    const book = new Azw3File(path);
    expect(book.authors).toEqual(["First Author", "Second Author"]);
    expect(book.author).toBe("First Author");
  });

  it("exposes version and mobiType from the header", () => {
    const path = writeFixture(buildAzwFile({ version: 8, mobiType: 2 }));
    const book = new Azw3File(path);
    expect(book.version).toBe(8);
    expect(book.mobiType).toBe(2);
  });

  it("throws AzwTagException for a bad top-level BOOKMOBI ident", () => {
    const path = writeFixture(buildAzwFile({ badIdent: true }));
    expect(() => new Azw3File(path)).toThrow(AzwTagException);
    expect(() => new Azw3File(path)).toThrow(/Invalid mobi header/);
  });

  it("throws AzwTagException for a bad inner MOBI magic", () => {
    const path = writeFixture(buildAzwFile({ badMobiMagic: true }));
    expect(() => new Azw3File(path)).toThrow(AzwTagException);
  });

  it("throws AzwTagException when the EXTH header is missing", () => {
    const path = writeFixture(buildAzwFile({ omitExth: true }));
    expect(() => new Azw3File(path)).toThrow(AzwTagException);
    expect(() => new Azw3File(path)).toThrow(/No EXTH header/);
  });

  it("decodes non-UTF8 codepages (windows-1252)", () => {
    const path = writeFixture(
      buildAzwFile({
        title: "Café",
        codepage: 1252,
        exthRecords: [exthString(100, "André", "latin1")],
      })
    );

    const book = new Azw3File(path);
    expect(book.title).toBe("Café");
    expect(book.author).toBe("André");
  });
});
