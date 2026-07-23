import AdmZip from "adm-zip";

/**
 * Builds a minimal, real (actually zippable/unzippable) EPUB file buffer:
 * `META-INF/container.xml` pointing at an OPF root file, plus that OPF
 * file's `<metadata>` block -- the two files SchemaReader.ts/
 * RootFilePathReader.ts/PackageReader.ts actually parse. No sample EPUB
 * exists anywhere in the Readarr source tree to translate a fixture from
 * (checked `src/NzbDrone.Core.Test/`; `EbookTagServiceFixture.cs`'s single
 * test constructs `EpubMetadataIdentifier` objects directly in C#, never
 * reads a real .epub file), so this builds one from scratch using this
 * module's own EPUB dependency (`adm-zip`) -- a real, valid EPUB container
 * a real e-reader could open, not just a parser-shaped stand-in.
 */

export interface BuildEpubOptions {
  version?: "2.0" | "3.0" | "3.1";
  opfPath?: string;
  metadataXml?: string;
}

const DEFAULT_METADATA_XML = `
  <dc:title>Sample Book Title</dc:title>
  <dc:creator opf:role="aut">Jane Author</dc:creator>
  <dc:creator opf:role="aut">John Coauthor</dc:creator>
  <dc:identifier id="isbn" opf:scheme="ISBN">9781455546176</dc:identifier>
  <dc:identifier opf:scheme="ASIN">B00ABCDEFG</dc:identifier>
  <dc:language>eng</dc:language>
  <dc:publisher>Sample Publisher</dc:publisher>
  <dc:description>A sample description.</dc:description>
  <meta name="calibre:series" content="Sample Series"/>
  <meta name="calibre:series_index" content="2"/>
`;

export function buildEpubFile(options: BuildEpubOptions = {}): Buffer {
  const version = options.version ?? "3.0";
  const opfPath = options.opfPath ?? "OEBPS/content.opf";
  const metadataXml = options.metadataXml ?? DEFAULT_METADATA_XML;

  const zip = new AdmZip();

  // Real EPUBs require an uncompressed "mimetype" entry first; not
  // required for this port's own reader (which only ever looks up
  // META-INF/container.xml and the OPF path by name), but included for
  // fidelity to a real EPUB container.
  zip.addFile("mimetype", Buffer.from("application/epub+zip", "ascii"));

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="${opfPath}" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.addFile("META-INF/container.xml", Buffer.from(containerXml, "utf8"));

  const opfXml = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="${version}" unique-identifier="isbn">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
${metadataXml}
  </metadata>
</package>`;
  zip.addFile(opfPath, Buffer.from(opfXml, "utf8"));

  return zip.toBuffer();
}
