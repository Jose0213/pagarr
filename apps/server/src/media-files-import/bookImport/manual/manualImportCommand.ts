import type { ImportMode } from "../../importMode.js";
import type { ManualImportFile } from "./manualImportFile.js";

/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Manual/ManualImportCommand.cs.
 * `Command` base class (NzbDrone.Core/Messaging/Commands/Command.cs,
 * Phase 4, not ported) is not reachable from this module -- ported as a
 * plain data interface carrying just the two real fields this command
 * declares plus the two overridden properties, matching this module's
 * general "Messaging not ported yet, keep the shape" convention (see
 * mediaFileService.ts's doc comment on `IHandle<T>`).
 */
export interface ManualImportCommand {
  files: ManualImportFile[];
  importMode: ImportMode;
  replaceExistingFiles: boolean;
  /** Ported from `Command.SendUpdatesToClient => true` (overridden). */
  readonly sendUpdatesToClient: true;
  /** Ported from `Command.RequiresDiskAccess => true` (overridden). */
  readonly requiresDiskAccess: true;
}
