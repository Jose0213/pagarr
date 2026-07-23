import { describe, expect, it } from "vitest";
import { XElement } from "../../../indexers/xml/XElement.js";
import {
  parseBookSummaryResource,
  parsePaginatedList,
  parsePaginationModel,
  parseReviewResource,
  parseUserShelfResource,
} from "../../goodreads/resources.js";

describe("parseUserShelfResource", () => {
  it("parses id and name from a <shelf> element", () => {
    const xml = "<shelf><id>123</id><name>to-read</name></shelf>";
    const el = XElement.parse(xml);

    expect(parseUserShelfResource(el)).toEqual({ id: 123, name: "to-read" });
  });
});

describe("parseBookSummaryResource", () => {
  it("parses id and work/id (WorkId)", () => {
    const xml = "<book><id>456</id><work><id>789</id></work></book>";
    const el = XElement.parse(xml);

    expect(parseBookSummaryResource(el)).toEqual({ id: 456, workId: 789 });
  });

  it("workId is null when there is no <work> element", () => {
    const xml = "<book><id>456</id></book>";
    const el = XElement.parse(xml);

    expect(parseBookSummaryResource(el).workId).toBeNull();
  });
});

describe("parseReviewResource", () => {
  it("parses id and nested book summary", () => {
    const xml = "<review><id>1</id><book><id>456</id><work><id>789</id></work></book></review>";
    const el = XElement.parse(xml);

    const review = parseReviewResource(el);
    expect(review.id).toBe(1);
    expect(review.book).toEqual({ id: 456, workId: 789 });
  });

  it("book is null when there is no <book> element", () => {
    const xml = "<review><id>1</id></review>";
    const el = XElement.parse(xml);

    expect(parseReviewResource(el).book).toBeNull();
  });
});

describe("parsePaginationModel", () => {
  it("reads start/end/total from element attributes", () => {
    const xml = '<reviews start="1" end="20" total="45"></reviews>';
    const el = XElement.parse(xml);

    expect(parsePaginationModel(el)).toEqual({ start: 1, end: 20, totalItems: 45 });
  });

  it("defaults to zero when attributes are missing", () => {
    const xml = "<reviews></reviews>";
    const el = XElement.parse(xml);

    expect(parsePaginationModel(el)).toEqual({ start: 0, end: 0, totalItems: 0 });
  });
});

describe("parsePaginatedList", () => {
  it("parses pagination plus every direct child via the supplied item parser", () => {
    const xml =
      '<shelves start="1" end="2" total="2"><shelf><id>1</id><name>to-read</name></shelf><shelf><id>2</id><name>read</name></shelf></shelves>';
    const el = XElement.parse(xml);

    const result = parsePaginatedList(el, parseUserShelfResource);

    expect(result.pagination).toEqual({ start: 1, end: 2, totalItems: 2 });
    expect(result.list).toEqual([
      { id: 1, name: "to-read" },
      { id: 2, name: "read" },
    ]);
  });
});
