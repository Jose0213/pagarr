import { describe, expect, it } from "vitest";
import { newAuthor, newAuthorMetadata } from "../../books/models.js";
import { newCustomFormat } from "../customFormat.js";
import {
  CustomFormatCalculationService,
  parseCustomFormat,
  type BlocklistLike,
  type BookFileLike,
  type EntityHistoryLike,
  type LocalBookLike,
  type RemoteBookLike,
} from "../customFormatCalculationService.js";
import type { CustomFormatInput } from "../customFormatInput.js";
import { IndexerFlags } from "../indexerFlags.js";
import { ReleaseTitleSpecification } from "../specifications/releaseTitleSpecification.js";
import { ReleaseGroupSpecification } from "../specifications/releaseGroupSpecification.js";
import { SizeSpecification } from "../specifications/sizeSpecification.js";
import { IndexerFlagSpecification } from "../specifications/indexerFlagSpecification.js";

function author(name = "Test Author") {
  return { ...newAuthor(), id: 1, metadata: { ...newAuthorMetadata(), name } };
}

function titleSpec(name: string, value: string, extra: Partial<ReleaseTitleSpecification> = {}) {
  const spec = new ReleaseTitleSpecification();
  spec.name = name;
  spec.value = value;
  Object.assign(spec, extra);
  return spec;
}

/** Ported/adapted from NzbDrone.Core.Test/CustomFormatsTests's matching fixtures (see CustomFormatsTestHelpers.cs -- the real repo has no dedicated CustomFormatCalculationServiceFixture, so these are new tests against the ported behavior). */
describe("parseCustomFormat (core matching/scoring)", () => {
  function input(overrides: Partial<CustomFormatInput> = {}): CustomFormatInput {
    return { bookInfo: null, author: null, size: 0, indexerFlags: 0, ...overrides };
  }

  it("returns formats whose single specification matches", () => {
    const format = newCustomFormat("Sparks", [titleSpec("Title", "SPARKS")]);

    const result = parseCustomFormat(input({ bookInfo: { releaseTitle: "Book.SPARKS" } }), [
      format,
    ]);

    expect(result).toEqual([format]);
  });

  it("excludes formats whose specification doesn't match", () => {
    const format = newCustomFormat("Sparks", [titleSpec("Title", "SPARKS")]);

    const result = parseCustomFormat(input({ bookInfo: { releaseTitle: "Book.OtherGroup" } }), [
      format,
    ]);

    expect(result).toEqual([]);
  });

  it("requires ALL specification-type groups to match (AND across groups)", () => {
    const format = newCustomFormat("Combo", [
      titleSpec("Title", "SPARKS"),
      Object.assign(new SizeSpecification(), { name: "Size", min: 0, max: 1 }),
    ]);

    const oneGb = 1024 * 1024 * 1024;

    // Title matches, size doesn't (2GB > 1GB max) -> overall no match
    expect(
      parseCustomFormat(input({ bookInfo: { releaseTitle: "SPARKS" }, size: 2 * oneGb }), [format])
    ).toEqual([]);

    // Both match -> overall match
    expect(
      parseCustomFormat(input({ bookInfo: { releaseTitle: "SPARKS" }, size: oneGb / 2 }), [format])
    ).toEqual([format]);
  });

  it("within a single specification-type group, matches if ANY spec matches and no required spec failed (OR within group)", () => {
    const format = newCustomFormat("MultiTitle", [
      titleSpec("Sparks", "SPARKS"),
      titleSpec("Framestor", "Framestor"),
    ]);

    // Only the second pattern matches -> group still matches (OR semantics)
    expect(
      parseCustomFormat(input({ bookInfo: { releaseTitle: "Some.Framestor.Release" } }), [format])
    ).toEqual([format]);
  });

  it("a failing required specification vetoes the whole group even if another spec in the group matched", () => {
    const format = newCustomFormat("RequiredVeto", [
      titleSpec("Required", "MUST_HAVE", { required: true }),
      titleSpec("Optional", "SPARKS"),
    ]);

    // "SPARKS" matches the optional pattern, but the required one fails.
    const result = parseCustomFormat(input({ bookInfo: { releaseTitle: "Book.SPARKS" } }), [
      format,
    ]);

    expect(result).toEqual([]);
  });

  it("negate inverts an individual specification's match before grouping", () => {
    const format = newCustomFormat("NotSparks", [
      titleSpec("NotSparks", "SPARKS", { negate: true }),
    ]);

    expect(
      parseCustomFormat(input({ bookInfo: { releaseTitle: "Book.SPARKS" } }), [format])
    ).toEqual([]);
    expect(
      parseCustomFormat(input({ bookInfo: { releaseTitle: "Book.Other" } }), [format])
    ).toEqual([format]);
  });

  it("a format with no specifications matches everything (empty group list -> Array.every is vacuously true)", () => {
    const format = newCustomFormat("Empty", []);

    expect(parseCustomFormat(input(), [format])).toEqual([format]);
  });

  it("returns matches sorted by Name", () => {
    const zebra = newCustomFormat("Zebra", []);
    const apple = newCustomFormat("Apple", []);

    const result = parseCustomFormat(input(), [zebra, apple]);

    expect(result.map((f) => f.name)).toEqual(["Apple", "Zebra"]);
  });

  it("matches ReleaseGroupSpecification against bookInfo.releaseGroup", () => {
    const spec = new ReleaseGroupSpecification();
    spec.value = "SPARKS";
    const format = newCustomFormat("Group", [spec]);

    expect(parseCustomFormat(input({ bookInfo: { releaseGroup: "SPARKS" } }), [format])).toEqual([
      format,
    ]);
    expect(parseCustomFormat(input({ bookInfo: { releaseGroup: "Other" } }), [format])).toEqual([]);
  });

  it("matches IndexerFlagSpecification against input.indexerFlags", () => {
    const spec = new IndexerFlagSpecification();
    spec.value = IndexerFlags.Freeleech;
    const format = newCustomFormat("Freeleech", [spec]);

    expect(parseCustomFormat(input({ indexerFlags: IndexerFlags.Freeleech }), [format])).toEqual([
      format,
    ]);
    expect(parseCustomFormat(input({ indexerFlags: 0 }), [format])).toEqual([]);
  });
});

describe("CustomFormatCalculationService overloads", () => {
  function service(formats = [newCustomFormat("Sparks", [titleSpec("Sparks", "SPARKS")])]) {
    return new CustomFormatCalculationService({ all: () => formats });
  }

  it("parseCustomFormatForRemoteBook: reads release.indexerFlags via ?? 0 fallback and parsedBookInfo", () => {
    const remoteBook: RemoteBookLike = {
      parsedBookInfo: { releaseTitle: "Book.SPARKS" },
      author: author(),
      release: undefined,
    };

    const result = service().parseCustomFormatForRemoteBook(remoteBook, 12345);
    expect(result.map((f) => f.name)).toEqual(["Sparks"]);
  });

  it("parseCustomFormatForRemoteBook: defaults indexerFlags to 0 when release is null/undefined", () => {
    const flagFormat = newCustomFormat("Freeleech", [
      Object.assign(new IndexerFlagSpecification(), { value: IndexerFlags.Freeleech }),
    ]);
    const remoteBook: RemoteBookLike = { parsedBookInfo: null, author: author(), release: null };

    const result = service([flagFormat]).parseCustomFormatForRemoteBook(remoteBook, 0);
    expect(result).toEqual([]);
  });

  it("parseCustomFormatForBookFile: prefers sceneName, falls back to originalFilePath, then Path's filename", () => {
    const withScene: BookFileLike = {
      sceneName: "SPARKS.Scene",
      originalFilePath: "irrelevant",
      path: "C:\\books\\irrelevant.epub",
      releaseGroup: null,
      size: 0,
      indexerFlags: 0,
    };
    expect(
      service()
        .parseCustomFormatForBookFile(withScene, author())
        .map((f) => f.name)
    ).toEqual(["Sparks"]);

    const withOriginalPath: BookFileLike = {
      sceneName: null,
      originalFilePath: "Some.SPARKS.Release",
      path: "C:\\books\\irrelevant.epub",
      releaseGroup: null,
      size: 0,
      indexerFlags: 0,
    };
    expect(
      service()
        .parseCustomFormatForBookFile(withOriginalPath, author())
        .map((f) => f.name)
    ).toEqual(["Sparks"]);

    const withPathOnly: BookFileLike = {
      sceneName: null,
      originalFilePath: null,
      path: "C:\\books\\Some.SPARKS.epub",
      releaseGroup: null,
      size: 0,
      indexerFlags: 0,
    };
    expect(
      service()
        .parseCustomFormatForBookFile(withPathOnly, author())
        .map((f) => f.name)
    ).toEqual(["Sparks"]);
  });

  it("parseCustomFormatForBlocklist: falls back to raw sourceTitle when no parser is wired in", () => {
    const blocklist: BlocklistLike = {
      sourceTitle: "Some.Book.SPARKS",
      size: 500,
      indexerFlags: 0,
    };

    const result = service().parseCustomFormatForBlocklist(blocklist, author());
    expect(result.map((f) => f.name)).toEqual(["Sparks"]);
  });

  it("parseCustomFormatForBlocklist: uses an injected parseBookTitle when provided", () => {
    const blocklist: BlocklistLike = {
      sourceTitle: "raw-unparsed-title",
      size: 0,
      indexerFlags: 0,
    };
    const svc = new CustomFormatCalculationService(
      { all: () => [newCustomFormat("Sparks", [titleSpec("Sparks", "SPARKS")])] },
      { parseBookTitle: () => ({ releaseTitle: "Parsed.SPARKS.Title", releaseGroup: "SPARKS" }) }
    );

    const result = svc.parseCustomFormatForBlocklist(blocklist, author());
    expect(result.map((f) => f.name)).toEqual(["Sparks"]);
  });

  it("parseCustomFormatForBlocklist: size defaults to 0 when null", () => {
    const sizeFormat = newCustomFormat("Big", [
      Object.assign(new SizeSpecification(), { min: 10, max: 20 }),
    ]);
    const blocklist: BlocklistLike = { sourceTitle: "x", size: null, indexerFlags: 0 };

    expect(service([sizeFormat]).parseCustomFormatForBlocklist(blocklist, author())).toEqual([]);
  });

  it("parseCustomFormatForHistory: reads size and indexerFlags out of the Data dictionary", () => {
    const flagFormat = newCustomFormat("Freeleech", [
      Object.assign(new IndexerFlagSpecification(), { value: IndexerFlags.Freeleech }),
    ]);

    const history: EntityHistoryLike = {
      sourceTitle: "Some.Book.Title",
      data: { size: "1024", indexerFlags: "Freeleech" },
    };

    const result = service([flagFormat]).parseCustomFormatForHistory(history, author());
    expect(result).toEqual([flagFormat]);
  });

  it("parseCustomFormatForHistory: size defaults to 0 and indexerFlags to 0 when Data is missing keys", () => {
    const history: EntityHistoryLike = { sourceTitle: "Some.Book.SPARKS", data: {} };

    const result = service().parseCustomFormatForHistory(history, author());
    expect(result.map((f) => f.name)).toEqual(["Sparks"]);
  });

  it("parseCustomFormatForHistory: indexerFlags name parsing is case-insensitive (Enum.TryParse ignoreCase: true)", () => {
    const flagFormat = newCustomFormat("Freeleech", [
      Object.assign(new IndexerFlagSpecification(), { value: IndexerFlags.Freeleech }),
    ]);
    const history: EntityHistoryLike = { sourceTitle: "x", data: { indexerFlags: "freeleech" } };

    expect(service([flagFormat]).parseCustomFormatForHistory(history, author())).toEqual([
      flagFormat,
    ]);
  });

  it("parseCustomFormatForLocalBook: uses sceneName as releaseTitle and author name from metadata", () => {
    const localBook: LocalBookLike = {
      author: author("Some Author"),
      sceneName: "Book.SPARKS",
      releaseGroup: "SPARKS",
      size: 0,
      indexerFlags: 0,
    };

    const result = service().parseCustomFormatForLocalBook(localBook);
    expect(result.map((f) => f.name)).toEqual(["Sparks"]);
  });
});
