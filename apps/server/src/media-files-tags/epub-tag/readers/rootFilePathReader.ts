import { OpfElement } from "../utils/opfXml.js";

/**
 * Ported from VersOne.Epub.Internal/RootFilePathReader.cs.
 *
 * .NET's `XNamespace`-qualified `Element(cnsNamespace + "container")` chain
 * matches by expanded namespace URI + local name; this port matches by
 * local name only (see opfXml.ts's header comment for why that
 * simplification is safe for EPUB container/OPF documents in practice).
 */
export function getRootFilePath(containerXml: string): string {
  const EPUB_CONTAINER_FILE_PATH = "META-INF/container.xml";

  const containerDocument = OpfElement.parse(containerXml);

  const fullPathAttribute = containerDocument
    .element("rootfiles")
    ?.element("rootfile")
    ?.attribute("full-path");

  if (!fullPathAttribute) {
    throw new Error(`EPUB parsing error: root file path not found in ${EPUB_CONTAINER_FILE_PATH}.`);
  }

  return fullPathAttribute;
}
