import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openBook } from "../epubReader.js";
import { buildEpubFile } from "./testFixture.js";

/**
 * No C# unit test fixture reads a real .epub file (checked
 * `src/NzbDrone.Core.Test/`; nothing under EpubTag/ has a test fixture at
 * all) -- these are new tests against a real, valid EPUB container built
 * at test time (see testFixture.ts), exercising the actual parsing path
 * EbookTagService.cs's `ReadEpub` depends on: EpubReader.OpenBook ->
 * SchemaReader -> RootFilePathReader + PackageReader -> the OPF metadata
 * fields Readarr actually reads (Titles, Creators, Identifiers, Languages,
 * Publishers, Description, MetaItems).
 */

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "epub-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeFixture(buffer: Buffer): string {
  const path = join(dir, "book.epub");
  writeFileSync(path, buffer);
  return path;
}

describe("openBook", () => {
  it("reads title and author list from a real EPUB 3.0 container", () => {
    const path = writeFixture(buildEpubFile());
    const book = openBook(path);

    expect(book.title).toBe("Sample Book Title");
    expect(book.authorList).toEqual(["Jane Author", "John Coauthor"]);
    expect(book.author).toBe("Jane Author, John Coauthor");
  });

  it("parses the EPUB version from the OPF package element", () => {
    const path = writeFixture(buildEpubFile({ version: "2.0" }));
    const book = openBook(path);
    expect(book.schema?.package.epubVersion).toBe("EPUB_2");
  });

  it("parses metadata identifiers with their opf:scheme attribute", () => {
    const path = writeFixture(buildEpubFile());
    const book = openBook(path);
    const identifiers = book.schema?.package.metadata.identifiers ?? [];

    const isbn = identifiers.find((x) => x.scheme === "ISBN");
    expect(isbn?.identifier).toBe("9781455546176");

    const asin = identifiers.find((x) => x.scheme === "ASIN");
    expect(asin?.identifier).toBe("B00ABCDEFG");
  });

  it("parses languages, publishers, and description", () => {
    const path = writeFixture(buildEpubFile());
    const book = openBook(path);
    const meta = book.schema?.package.metadata;

    expect(meta?.languages).toEqual(["eng"]);
    expect(meta?.publishers).toEqual(["Sample Publisher"]);
    expect(meta?.description).toBe("A sample description.");
  });

  it("parses calibre series meta items (name/content shape, as Calibre writes into EPUB2 packages)", () => {
    // PackageReader.ts's `readMetadataMetaVersion2` (the `name`/`content`
    // attribute shape Calibre actually writes for `calibre:series`) only
    // fires for `EpubVersion.EPUB_2` packages -- `EPUB_3_0`/`EPUB_3_1`
    // packages always use `readMetadataMetaVersion3`'s `property`/`refines`
    // shape instead, matching PackageReader.cs's `ReadMetadata`
    // version-gated switch exactly (a real, faithfully-preserved quirk:
    // Calibre's `name`/`content` `calibre:series` meta tag is only
    // recognized in EPUB2 packages by this reader, matching upstream
    // VersOne.Epub's actual behavior).
    const path = writeFixture(buildEpubFile({ version: "2.0" }));
    const book = openBook(path);
    const metaItems = book.schema?.package.metadata.metaItems ?? [];

    const series = metaItems.find((x) => x.name === "calibre:series");
    const seriesIndex = metaItems.find((x) => x.name === "calibre:series_index");
    expect(series?.content).toBe("Sample Series");
    expect(seriesIndex?.content).toBe("2");
  });

  it("resolves the OPF root file relative to a nested rootfile path", () => {
    const path = writeFixture(buildEpubFile({ opfPath: "content/book.opf" }));
    const book = openBook(path);
    expect(book.schema?.contentDirectoryPath).toBe("content");
    expect(book.title).toBe("Sample Book Title");
  });

  it("throws when the file doesn't exist", () => {
    expect(() => openBook(join(dir, "missing.epub"))).toThrow(/not found/);
  });

  it("throws when META-INF/container.xml is missing", () => {
    const zip = new AdmZip();
    zip.addFile("mimetype", Buffer.from("application/epub+zip"));
    const path = writeFixture(zip.toBuffer());

    expect(() => openBook(path)).toThrow(/container\.xml/);
  });
});
