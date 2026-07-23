import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Minimal `System.Xml.Linq.XElement`-shaped adapter for OPF/container XML,
 * covering exactly what PackageReader.ts / rootFilePathReader.ts need
 * (`Element(name)`, `Elements()`, `Attribute(name)`, `.Value`,
 * `GetLowerCaseLocalName()`). `apps/server/src/indexers/xml/XElement.ts`
 * already wraps `fast-xml-parser` the same way for RSS/Torznab parsing, but
 * that wrapper matches child/attribute names by their *literal* tag string
 * (e.g. `"torznab:attr"`) since Torznab/Newznab feeds are namespace-prefix-
 * stable by convention. EPUB's OPF/container XML is the opposite case: the
 * real C# source (XmlExtensionMethods.cs's `GetLowerCaseLocalName()`)
 * explicitly strips whatever namespace prefix a given EPUB happens to use
 * (`dc:title`, `opf:role`, or no prefix at all depending on the producing
 * tool) and matches on the *local* name only, case-insensitively -- so this
 * is a separate, narrower wrapper built the same way (`fast-xml-parser`,
 * `preserveOrder: true`) rather than a namespace-URI-aware reuse of the RSS
 * one, which would be a bigger behavior change than reusing its shape
 * warrants.
 *
 * `System.Xml.Linq.XElement.Element`/`.Attribute` match by *expanded*
 * `XName` (namespace URI + local name) in the true C# source; this port
 * simplifies that to local-name-only matching everywhere (dropping
 * namespace-URI discrimination entirely), which is safe here because OPF
 * metadata's only same-local-name/different-namespace ambiguity in
 * practice is the `id`/`opf:scheme` distinction on `<dc:identifier>` --
 * already exact-attribute-name matched in `readMetadataIdentifier` below,
 * not local-name matched -- and there is no legitimate EPUB producer that
 * emits two _same-local-name_ metadata elements distinguished only by
 * namespace prefix.
 */

const parserOptions = {
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
} as const;

type RawNode = Record<string, unknown>;

export class OpfElement {
  private readonly tagName: string;
  private readonly children: RawNode[];
  private readonly attrs: Record<string, string>;

  private constructor(tagName: string, children: RawNode[], attrs: Record<string, string>) {
    this.tagName = tagName;
    this.children = children;
    this.attrs = attrs;
  }

  /**
   * Ported from XDocument.Load(stream): parses XML text into a root
   * element, throwing on malformed markup (matching
   * `System.Xml.XmlException`, which RootFilePathReader.ts/PackageReader.ts
   * let propagate as a generic parsing-error `Error`).
   */
  static parse(xml: string): OpfElement {
    const validation = XMLValidator.validate(xml);
    if (validation !== true) {
      throw new Error(`EPUB parsing error: invalid XML (${validation.err.msg})`);
    }

    const parser = new XMLParser(parserOptions);
    const parsed = parser.parse(xml) as RawNode[];
    const rootNode = parsed.find((node) => !("?xml" in node));

    if (!rootNode) {
      throw new Error("EPUB parsing error: no root element found");
    }

    return OpfElement.fromNode(rootNode);
  }

  private static fromNode(node: RawNode): OpfElement {
    const attrs = (node[":@"] as Record<string, string> | undefined) ?? {};
    const [tagName, tagChildren] =
      Object.entries(node).find(([key]) => key !== ":@") ?? ([undefined, undefined] as const);

    if (tagName === undefined) {
      throw new Error("EPUB parsing error: no tag found");
    }

    const normalizedAttrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(attrs)) {
      normalizedAttrs[key.replace(/^@_/, "")] = String(value);
    }

    return new OpfElement(tagName, (tagChildren as RawNode[] | undefined) ?? [], normalizedAttrs);
  }

  /** Ported from `XmlExtensionMethods.GetLowerCaseLocalName(this XElement)`: strips any `prefix:` and lowercases. */
  get lowerCaseLocalName(): string {
    const idx = this.tagName.indexOf(":");
    return (idx === -1 ? this.tagName : this.tagName.slice(idx + 1)).toLowerCase();
  }

  /** Ported from `XElement.Element(XName name)`: first matching direct child by local name, or null. */
  element(localName: string): OpfElement | null {
    for (const child of this.elements()) {
      if (child.lowerCaseLocalName === localName.toLowerCase()) {
        return child;
      }
    }
    return null;
  }

  /** Ported from `XElement.Elements()`: all direct child elements, in document order (text/comment pseudo-nodes excluded). */
  elements(): OpfElement[] {
    const result: OpfElement[] = [];
    for (const child of this.children) {
      if (isElementNode(child)) {
        result.push(OpfElement.fromNode(child));
      }
    }
    return result;
  }

  /**
   * Ported from `XAttribute.GetLowerCaseLocalName()`-based attribute
   * lookup (PackageReader.ts's readers all iterate `.Attributes()` and
   * switch on the lowercased local name) plus a couple of call sites
   * (`opf:scheme`) that match the exact prefixed name instead -- both
   * shapes are exposed here: `attribute(name)` matches the literal
   * attribute name as written (case-sensitive, matching
   * `XElement.Attribute(name)?.Value`), used where the C# source checks an
   * exact prefixed name like `"opf:scheme"`.
   */
  attribute(name: string): string | null {
    return Object.hasOwn(this.attrs, name) ? this.attrs[name]! : null;
  }

  /** All attributes paired with their lowercased local name, for the `switch (attr.GetLowerCaseLocalName())` call sites. */
  attributesByLowerLocalName(): [string, string][] {
    return Object.entries(this.attrs).map(([key, value]) => {
      const idx = key.indexOf(":");
      const localName = idx === -1 ? key : key.slice(idx + 1);
      return [localName.toLowerCase(), value];
    });
  }

  /**
   * Raw attribute entries with their *literal* key exactly as written
   * (prefix included, un-lowercased) -- for the one call site
   * (readMetadataIdentifier's `case "opf:scheme"`) that switches on the
   * literal `GetLowerCaseLocalName()` string `"opf:scheme"` rather than a
   * true local name. See packageReader.ts's `readMetadataIdentifier` for
   * why: real-world EPUB2 files frequently don't declare the `opf:` prefix
   * as an XML namespace inside `<metadata>`, so .NET's XML parser (and
   * this port) sees the whole colon-containing string as the attribute's
   * name rather than splitting it into namespace + local name.
   */
  rawAttributeEntries(): [string, string][] {
    return Object.entries(this.attrs).map(([key, value]) => [key.toLowerCase(), value]);
  }

  /** Ported from `XElement.Value`: concatenated text content of this element (direct text children only, matching XElement's shallow .Value for leaf metadata nodes). */
  get value(): string {
    return this.children
      .filter((c) => "#text" in c)
      .map((c) => String(c["#text"]))
      .join("");
  }
}

function isElementNode(node: RawNode): boolean {
  return Object.keys(node).some((k) => k !== ":@" && k !== "#text" && k !== "#comment");
}
