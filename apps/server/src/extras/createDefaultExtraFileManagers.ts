import type { IManageExtraFiles } from "./extraFileManager.js";
import { MetadataService } from "./metadata/metadataService.js";
import { OtherExtraService } from "./others/otherExtraService.js";

/**
 * Ported from the *intent* of C#'s DI-container reflection scan over
 * `IManageExtraFiles` implementations (`ExtraService`'s constructor takes
 * `IEnumerable<IManageExtraFiles> extraFileManagers`) -- builds the
 * explicit array `ExtraService` needs, matching this project's established
 * "explicit over reflection" pattern (see
 * decision-engine/createDefaultSpecifications.ts). There are exactly two
 * real `IManageExtraFiles` implementations in the C# source:
 * `MetadataService` and `OtherExtraService` (both `Order => 0`/`Order => 2`
 * respectively -- order matters here, unlike DecisionEngine's
 * specifications, since `ExtraService.ImportExtraFiles` breaks on the
 * first manager whose `Import()` returns non-null, and
 * `ExtraService.Handle(*)` iterates managers in `.OrderBy(e => e.Order)`
 * sequence).
 */
export function createDefaultExtraFileManagers(deps: {
  metadataService: MetadataService;
  otherExtraService: OtherExtraService;
}): IManageExtraFiles[] {
  return [deps.metadataService, deps.otherExtraService].sort((a, b) => a.order - b.order);
}
