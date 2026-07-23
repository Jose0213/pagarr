import { OpfElement } from "../utils/opfXml.js";
import type { EpubVersion } from "../schema/epubVersion.js";
import type {
  EpubMetadata,
  EpubMetadataContributor,
  EpubMetadataCreator,
  EpubMetadataDate,
  EpubMetadataIdentifier,
  EpubMetadataMeta,
} from "../schema/epubMetadata.js";
import type { EpubPackage } from "../schema/epubPackage.js";

/**
 * Ported from VersOne.Epub.Internal/PackageReader.cs.
 *
 * Takes the already-extracted root-file XML text (the C# source takes a
 * `ZipArchive` + `rootFilePath` and opens the zip entry itself --
 * epubReader.ts does that zip-entry lookup instead, since Node's zip
 * library of choice (see epubReader.ts) has a different, callback-based
 * entry-reading API than `ZipArchive.GetEntry`/`.Open()`; this function
 * only takes the resulting XML text, keeping the zip-specific code
 * confined to epubReader.ts).
 */
export function readPackage(rootFileXml: string): EpubPackage {
  const packageNode = OpfElement.parse(rootFileXml);

  const epubVersionValue = packageNode.attribute("version");
  let epubVersion: EpubVersion;
  switch (epubVersionValue) {
    case "1.0":
    case "2.0":
      epubVersion = "EPUB_2";
      break;
    case "3.0":
      epubVersion = "EPUB_3_0";
      break;
    case "3.1":
      epubVersion = "EPUB_3_1";
      break;
    default:
      throw new Error(`Unsupported EPUB version: ${String(epubVersionValue)}.`);
  }

  const metadataNode = packageNode.element("metadata");
  if (!metadataNode) {
    throw new Error("EPUB parsing error: metadata not found in the package.");
  }

  const metadata = readMetadata(metadataNode, epubVersion);

  return { epubVersion, metadata };
}

function readMetadata(metadataNode: OpfElement, epubVersion: EpubVersion): EpubMetadata {
  const result: EpubMetadata = {
    titles: [],
    creators: [],
    subjects: [],
    description: null,
    publishers: [],
    contributors: [],
    dates: [],
    types: [],
    formats: [],
    identifiers: [],
    sources: [],
    languages: [],
    relations: [],
    coverages: [],
    rights: [],
    metaItems: [],
  };

  for (const metadataItemNode of metadataNode.elements()) {
    const innerText = metadataItemNode.value;

    switch (metadataItemNode.lowerCaseLocalName) {
      case "title":
        result.titles.push(innerText);
        break;
      case "creator":
        result.creators.push(readMetadataCreator(metadataItemNode));
        break;
      case "subject":
        result.subjects.push(innerText);
        break;
      case "description":
        result.description = innerText;
        break;
      case "publisher":
        result.publishers.push(innerText);
        break;
      case "contributor":
        result.contributors.push(readMetadataContributor(metadataItemNode));
        break;
      case "date":
        result.dates.push(readMetadataDate(metadataItemNode));
        break;
      case "type":
        result.types.push(innerText);
        break;
      case "format":
        result.formats.push(innerText);
        break;
      case "identifier":
        result.identifiers.push(readMetadataIdentifier(metadataItemNode));
        break;
      case "source":
        result.sources.push(innerText);
        break;
      case "language":
        result.languages.push(innerText);
        break;
      case "relation":
        result.relations.push(innerText);
        break;
      case "coverage":
        result.coverages.push(innerText);
        break;
      case "rights":
        result.rights.push(innerText);
        break;
      case "meta":
        if (epubVersion === "EPUB_2") {
          result.metaItems.push(readMetadataMetaVersion2(metadataItemNode));
        } else if (epubVersion === "EPUB_3_0" || epubVersion === "EPUB_3_1") {
          result.metaItems.push(readMetadataMetaVersion3(metadataItemNode));
        }
        break;
      default:
        break;
    }
  }

  return result;
}

function readMetadataCreator(node: OpfElement): EpubMetadataCreator {
  let role: string | null = null;
  let fileAs: string | null = null;

  for (const [localName, value] of node.attributesByLowerLocalName()) {
    switch (localName) {
      case "role":
        role = value;
        break;
      case "file-as":
        fileAs = value;
        break;
      default:
        break;
    }
  }

  return { creator: node.value, fileAs, role };
}

function readMetadataContributor(node: OpfElement): EpubMetadataContributor {
  let role: string | null = null;
  let fileAs: string | null = null;

  for (const [localName, value] of node.attributesByLowerLocalName()) {
    switch (localName) {
      case "role":
        role = value;
        break;
      case "file-as":
        fileAs = value;
        break;
      default:
        break;
    }
  }

  return { contributor: node.value, fileAs, role };
}

/**
 * Ported from `PackageReader.ReadMetadataDate`. C# reads the `event`
 * attribute namespace-qualified to the *element's own* namespace
 * (`metadataDateNode.Name.Namespace + "event"`, i.e. unprefixed `event=`
 * on a `<dc:date>` element) -- matched here as the literal unprefixed
 * attribute name, consistent with opfXml.ts's local-name-only simplification.
 */
function readMetadataDate(node: OpfElement): EpubMetadataDate {
  const event = node.attribute("event");
  return { date: node.value, event };
}

/**
 * Ported from `PackageReader.ReadMetadataIdentifier`. Unlike every other
 * reader here, the C# source switches on the *literal*
 * `GetLowerCaseLocalName()` string `"opf:scheme"` (colon included) rather
 * than a true split-off local name -- see opfXml.ts's
 * `rawAttributeEntries()` doc comment for why. `id`, by contrast, genuinely
 * is never prefixed in practice, so plain `"id"` still matches correctly
 * whether read via local-name or raw-key lookup.
 */
function readMetadataIdentifier(node: OpfElement): EpubMetadataIdentifier {
  let id: string | null = null;
  let scheme: string | null = null;

  for (const [rawKey, value] of node.rawAttributeEntries()) {
    switch (rawKey) {
      case "id":
        id = value;
        break;
      case "opf:scheme":
        scheme = value;
        break;
      default:
        break;
    }
  }

  return { id, scheme, identifier: node.value };
}

function readMetadataMetaVersion2(node: OpfElement): EpubMetadataMeta {
  let name: string | null = null;
  let content: string | null = null;

  for (const [localName, value] of node.attributesByLowerLocalName()) {
    switch (localName) {
      case "name":
        name = value;
        break;
      case "content":
        content = value;
        break;
      default:
        break;
    }
  }

  return { name, content, id: null, refines: null, property: null, scheme: null };
}

function readMetadataMetaVersion3(node: OpfElement): EpubMetadataMeta {
  let id: string | null = null;
  let refines: string | null = null;
  let property: string | null = null;
  let scheme: string | null = null;

  for (const [localName, value] of node.attributesByLowerLocalName()) {
    switch (localName) {
      case "id":
        id = value;
        break;
      case "refines":
        refines = value;
        break;
      case "property":
        property = value;
        break;
      case "scheme":
        scheme = value;
        break;
      default:
        break;
    }
  }

  return { id, refines, property, scheme, name: null, content: node.value };
}
