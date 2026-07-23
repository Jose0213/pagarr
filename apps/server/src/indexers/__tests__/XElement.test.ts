import { describe, expect, it } from "vitest";
import { XElement } from "../xml/XElement.js";

describe("XElement", () => {
  it("parses a root element and skips the XML declaration node", () => {
    const root = XElement.parse(
      '<?xml version="1.0"?><rss><channel><title>Hi</title></channel></rss>'
    );
    expect(root.name).toBe("rss");
  });

  it("element() returns the first matching direct child", () => {
    const root = XElement.parse("<root><a>1</a><a>2</a><b>3</b></root>");
    expect(root.element("a")?.value).toBe("1");
    expect(root.element("b")?.value).toBe("3");
    expect(root.element("missing")).toBeNull();
  });

  it("elements() returns all matching direct children in document order, preserving repeats", () => {
    const root = XElement.parse("<root><a>1</a><a>2</a><a>3</a></root>");
    const values = root.elements("a").map((e) => e.value);
    expect(values).toEqual(["1", "2", "3"]);
  });

  it("elements() with no name returns every direct child", () => {
    const root = XElement.parse("<root><a>1</a><b>2</b></root>");
    expect(root.elements().map((e) => e.name)).toEqual(["a", "b"]);
  });

  it("attribute() reads a present attribute and returns null for a missing one", () => {
    const root = XElement.parse('<root><item isPermaLink="true" other="x">v</item></root>');
    const item = root.element("item")!;
    expect(item.attribute("isPermaLink")).toBe("true");
    expect(item.attribute("missing")).toBeNull();
  });

  it("matches namespace-prefixed tag names literally (e.g. torznab:attr)", () => {
    const root = XElement.parse(
      '<rss xmlns:torznab="http://torznab.com/schemas/2015/feed"><item><torznab:attr name="seeders" value="7" /><torznab:attr name="peers" value="9" /></item></rss>'
    );
    const item = root.element("item")!;
    const attrs = item.elements("torznab:attr");
    expect(attrs).toHaveLength(2);
    expect(attrs[0]!.attribute("name")).toBe("seeders");
    expect(attrs[1]!.attribute("value")).toBe("9");
  });

  it("descendants() finds elements anywhere in the subtree", () => {
    const root = XElement.parse(
      '<root><a><b><error code="100" description="bad" /></b></a></root>'
    );
    const errors = root.descendants("error");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.attribute("code")).toBe("100");
  });

  it("value concatenates text content", () => {
    const root = XElement.parse("<root><item>hello</item></root>");
    expect(root.element("item")!.value).toBe("hello");
  });

  it("decodes XML entities in text content", () => {
    const root = XElement.parse("<root><item>Tom &amp; Jerry</item></root>");
    expect(root.element("item")!.value).toBe("Tom & Jerry");
  });
});
