import { XMLParser } from "fast-xml-parser";
import { InvalidNzbException } from "./invalidNzbException.js";

/**
 * Ported from NzbDrone.Core/Download/NzbValidationService.cs.
 *
 * C# uses `System.Xml.Linq.XDocument`/`XmlReader` with DTD processing
 * disabled and comments ignored. This repo already depends on
 * `fast-xml-parser` (see package.json, used elsewhere for indexer response
 * XML -- see indexers/RssParser.ts et al.) -- reused here rather than
 * adding a second XML dependency. `fast-xml-parser` ignores DTDs and
 * comments by default (no DOCTYPE/comment expansion), matching the C#
 * reader settings' intent.
 */
export interface IValidateNzbs {
  validate(filename: string, fileContent: string): void;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
});

export class NzbValidationService implements IValidateNzbs {
  validate(filename: string, fileContent: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = parser.parse(fileContent) as Record<string, unknown>;
    } catch {
      throw new InvalidNzbException("Invalid NZB: No Root element [{0}]", filename);
    }

    const rootKeys = Object.keys(parsed).filter((k) => !k.startsWith("?"));
    const rootName = rootKeys[0];

    if (rootName === undefined) {
      throw new InvalidNzbException("Invalid NZB: No Root element [{0}]", filename);
    }

    const root = parsed[rootName] as Record<string, unknown> | undefined;

    // nZEDb has a bug in their error reporting code spitting out invalid
    // HTTP status codes as an <error code="..." description="..."/> root.
    if (rootName === "error" && root !== undefined) {
      const code = root["@_code"];
      const description = root["@_description"];
      if (code !== undefined && description !== undefined) {
        throw new InvalidNzbException(
          "Invalid NZB: Contains indexer error: {0} - {1}",
          code,
          description
        );
      }
    }

    if (rootName !== "nzb") {
      throw new InvalidNzbException(
        "Invalid NZB: Unexpected root element. Expected 'nzb' found '{0}' [{1}]",
        rootName,
        filename
      );
    }

    const files = root ? root["file"] : undefined;
    const fileCount = files === undefined ? 0 : Array.isArray(files) ? files.length : 1;

    if (fileCount === 0) {
      throw new InvalidNzbException("Invalid NZB: No files [{0}]", filename);
    }
  }
}
