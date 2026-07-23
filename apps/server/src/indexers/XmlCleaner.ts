/** Ported from NzbDrone.Core/Indexers/XmlCleaner.cs. */

const REPLACE_ENTITIES_REGEX = /&[a-z]+;/gi;

// Ported from the C# regex `[^\x09\x0A\x0D -퟿-�]` --
// everything outside XML 1.0's legal character ranges (tab, LF, CR, plus
// the two BMP printable ranges split around the UTF-16 surrogate range).
// Built via `new RegExp(string)` rather than a `/.../` literal so the
// `\uXXXX` escapes stay unambiguous source text instead of risking an
// editor/tool silently normalizing them to literal characters.
const UNICODE_ALLOWED_PATTERN = "[^\\x09\\x0A\\x0D\\u0020-\\uD7FF\\uE000-\\uFFFD]";
const REPLACE_UNICODE_REGEX = new RegExp(UNICODE_ALLOWED_PATTERN, "gi");

export const XmlCleaner = {
  replaceEntities(content: string): string {
    return content.replace(REPLACE_ENTITIES_REGEX, replaceEntity);
  },

  replaceUnicode(content: string): string {
    return content.replace(REPLACE_UNICODE_REGEX, "");
  },
};

function replaceEntity(match: string): string {
  try {
    const decoded = htmlDecode(match);
    const codePoint = decoded.codePointAt(0);
    if (codePoint === undefined) {
      return match;
    }
    return `&#${codePoint};`;
  } catch {
    return match;
  }
}

/**
 * Ported from WebUtility.HtmlDecode(match.Value) as used by
 * XmlCleaner.ReplaceEntity -- decodes a single named HTML entity (the regex
 * only ever matches `&[a-z]+;`-shaped named entities here, so a small named
 * entity table covers real-world usage without pulling in a full HTML
 * entity decoder dependency).
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "©",
  reg: "®",
  trade: "™",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

function htmlDecode(entity: string): string {
  const name = entity.slice(1, -1).toLowerCase();
  const decoded = NAMED_ENTITIES[name];
  if (decoded === undefined) {
    throw new Error(`Unknown entity: ${entity}`);
  }
  return decoded;
}
