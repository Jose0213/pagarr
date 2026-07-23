import type { IImportExistingExtraFiles } from "./importExistingExtraFiles.js";
import { ExistingMetadataImporter } from "./metadata/existingMetadataImporter.js";
import { ExistingOtherExtraImporter } from "./others/existingOtherExtraImporter.js";

/**
 * Ported from the *intent* of C#'s DI-container reflection scan over
 * `IImportExistingExtraFiles` implementations (`ExistingExtraFileService`'s
 * constructor takes `IEnumerable<IImportExistingExtraFiles>
 * existingExtraFileImporters`) -- builds the explicit array
 * `ExistingExtraFileService` needs, matching this project's established
 * "explicit over reflection" pattern (see
 * decision-engine/createDefaultSpecifications.ts). There are exactly two
 * real `IImportExistingExtraFiles` implementations in the C# source:
 * `ExistingMetadataImporter` (`Order => 0`) and `ExistingOtherExtraImporter`
 * (`Order => 2`) -- order matters, since each importer's `importedFiles`
 * accumulator feeds into the next importer's `Filter`/`Clean` pass (see
 * `ExistingExtraFileService.Handle`).
 */
export function createDefaultImporters(deps: {
  existingMetadataImporter: ExistingMetadataImporter;
  existingOtherExtraImporter: ExistingOtherExtraImporter;
}): IImportExistingExtraFiles[] {
  return [deps.existingMetadataImporter, deps.existingOtherExtraImporter].sort(
    (a, b) => a.order - b.order
  );
}
