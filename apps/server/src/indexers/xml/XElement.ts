import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Minimal `System.Xml.Linq.XElement`-shaped adapter used by the ported RSS
 * parsers (RssParser.cs, TorznabRssParser.cs, NewznabRssParser.cs,
 * XElementExtensions.cs all traverse XML via `XElement.Element(name)` /
 * `.Elements(name)` / `.Attribute(name)` / `.Value`).
 *
 * .NET's `System.Xml.Linq` is a full XML DOM with namespace-qualified
 * `XName`s; Node has no equivalent in the standard library. This adapter is
 * built on `fast-xml-parser` (added as this module's only new runtime
 * dependency) configured with `preserveOrder: true`, which yields an
 * ordered array-of-nodes tree that -- unlike fast-xml-parser's default
 * object-merging mode -- preserves *repeated* sibling tags (e.g. multiple
 * `<torznab:attr>` elements, or duplicate `<category>` elements) as
 * distinct entries instead of collapsing them into an array-valued object
 * key. That ordered/repeatable shape is what makes `.Elements(name)`
 * (plural, matches everything) and positional traversal behave the same as
 * the real `XElement`.
 *
 * Namespace handling: Torznab/Newznab attrs are tag-qualified
 * (`torznab:attr`, `newznab:attr`). C#'s `XElement.Elements(ns + "attr")`
 * matches by *expanded* namespace URI, independent of whatever prefix the
 * document declares. This adapter instead matches by the literal prefixed
 * tag name (`"torznab:attr"` / `"newznab:attr"`) since every real-world
 * feed (and both fixture files ported into this module's tests) uses the
 * standard prefix -- documented as a pragmatic simplification, not a
 * silent behavior change, since Torznab/Newznab spec examples and every
 * known indexer always use these exact prefixes.
 */

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  // fast-xml-parser's default entity set only decodes the 5 predefined XML
  // named entities (&amp; &lt; &gt; &quot; &apos;); numeric character
  // references (&#38; &#x26; ...) are left completely undecoded without
  // this flag. XmlCleaner.replaceEntities() (matching the C# original's
  // WebUtility.HtmlDecode-then-renumber behavior) deliberately rewrites
  // every named entity into a numeric one *before* parsing, so numeric
  // decoding has to work for feed content to round-trip correctly.
  htmlEntities: true,
} as const;

type RawNode = Record<string, unknown>;

export class XElement {
  readonly name: string;
  private readonly children: RawNode[];
  private readonly attrs: Record<string, string>;

  private constructor(name: string, children: RawNode[], attrs: Record<string, string>) {
    this.name = name;
    this.children = children;
    this.attrs = attrs;
  }

  /**
   * Ported from XDocument.Load / XDocument.Parse -- parses XML text into a
   * root element, throwing on malformed markup (matching
   * `System.Xml.XmlException`, which callers like
   * NewznabCapabilitiesProvider.ts explicitly catch). `fast-xml-parser`'s
   * `XMLParser.parse()` alone is lenient by design -- it silently accepts
   * malformed tags (e.g. stray `<>`) as weird-but-parseable text/tag-name
   * content rather than erroring -- so well-formedness is checked
   * explicitly via `XMLValidator.validate()` first.
   */
  static parse(xml: string): XElement {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new Error(`Invalid XML: ${validation.err.msg} (line ${validation.err.line})`);
    }

    const parser = new XMLParser(parserOptions);
    const parsed = parser.parse(xml) as RawNode[];

    // preserveOrder wraps the whole doc in an array; find the first "real"
    // element node (skips a leading `?xml` declaration node, if present).
    const rootNode = parsed.find((node) => !("?xml" in node));

    if (!rootNode) {
      throw new Error("Invalid XML: no root element found");
    }

    return XElement.fromNode(rootNode);
  }

  private static fromNode(node: RawNode): XElement {
    if (!isElementNode(node)) {
      throw new Error("Invalid XML node: not an element (text/comment pseudo-node)");
    }

    const attrs = (node[":@"] as Record<string, string> | undefined) ?? {};
    const [tagName, tagChildren] =
      Object.entries(node).find(([key]) => key !== ":@") ?? ([undefined, undefined] as const);

    if (tagName === undefined) {
      throw new Error("Invalid XML node: no tag found");
    }

    const normalizedAttrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      normalizedAttrs[key.replace(/^@_/, "")] = String(value);
    }

    return new XElement(tagName, (tagChildren as RawNode[] | undefined) ?? [], normalizedAttrs);
  }

  /** Ported from XElement.Element(XName name): first matching direct child, or null. */
  element(name: string): XElement | null {
    for (const child of this.children) {
      if (isTagNode(child, name)) {
        return XElement.fromNode(child);
      }
    }
    return null;
  }

  /** Ported from XElement.Elements(XName name): all matching direct children, in document order. */
  elements(name?: string): XElement[] {
    const result: XElement[] = [];
    for (const child of this.children) {
      if (name === undefined) {
        if (isElementNode(child)) {
          result.push(XElement.fromNode(child));
        }
      } else if (isTagNode(child, name)) {
        result.push(XElement.fromNode(child));
      }
    }
    return result;
  }

  /** Ported from XElement.Descendants(XName name): all matching elements anywhere in the subtree. */
  descendants(name: string): XElement[] {
    const result: XElement[] = [];
    const visit = (el: XElement): void => {
      if (el.name === name) {
        result.push(el);
      }
      for (const child of el.elements()) {
        visit(child);
      }
    };
    for (const child of this.elements()) {
      visit(child);
    }
    return result;
  }

  /** Ported from XElement.Attribute(XName name)?.Value -- null when absent. */
  attribute(name: string): string | null {
    return Object.hasOwn(this.attrs, name) ? this.attrs[name]! : null;
  }

  /** Ported from XElement.Value: concatenated text content of this element. */
  get value(): string {
    return this.children
      .filter((c) => "#text" in c)
      .map((c) => String(c["#text"]))
      .join("");
  }
}

/**
 * True for a node that represents a real child *element* (as opposed to a
 * `fast-xml-parser` "text sibling" pseudo-node like `{"#text": "\n  "}`,
 * which `preserveOrder` mode emits for whitespace/text runs between
 * element tags). `#text` isn't a tag name XElement.Element()/.Elements()
 * would ever match against in the real .NET XElement model, so it's
 * excluded here rather than treated as a same-shape child node -- without
 * this check, `fromNode()` would treat `"#text"` as a tag name and its
 * string value as `tagChildren`, corrupting the tree (iterating a string's
 * characters as if they were child nodes).
 */
function isElementNode(node: RawNode): boolean {
  return Object.keys(node).some((k) => k !== ":@" && k !== "#text" && k !== "#comment");
}

function isTagNode(node: RawNode, name: string): boolean {
  return Object.keys(node).some(
    (key) => key !== ":@" && key !== "#text" && key !== "#comment" && key === name
  );
}
