import type { ModelBase } from "../../db/model-base.js";

/**
 * Ported from NzbDrone.Core/Organizer/NamingConfig.cs +
 * NzbDrone.Core/Organizer/BasicNamingConfig.cs.
 *
 * Backing table: `NamingConfig` -- already exists in this repo's schema
 * (see db/migrations/0001_initial_setup.sql, extended by
 * 0012_add_bookfile_part_naming_token.sql and
 * 0031_add_colon_replacement_to_naming_config.sql), so no new migration is
 * needed for this module.
 */

/** Ported from Organizer/ColonReplacementFormat.cs (nested enum in FileNameBuilder.cs's namespace). Stored as an integer in NamingConfig.ColonReplacementFormat. */
export enum ColonReplacementFormat {
  Delete = 0,
  Dash = 1,
  SpaceDash = 2,
  SpaceDashSpace = 3,
  Smart = 4,
}

export interface NamingConfig extends ModelBase {
  renameBooks: boolean;
  replaceIllegalCharacters: boolean;
  colonReplacementFormat: ColonReplacementFormat;
  standardBookFormat: string;
  authorFolderFormat: string;
}

/**
 * Ported from `NamingConfig.Default` (static property). C# builds
 * `StandardBookFormat` via string concatenation with
 * `Path.DirectorySeparatorChar` (OS-dependent: `\` on Windows, `/`
 * elsewhere) -- ported literally as `/`, matching this port's other
 * path-handling conventions (see root-folders/path-utils.ts) of running on
 * whichever OS the process is actually on. `FileNameBuilder.BuildBookFileName`
 * splits on both `\` and `/` (see fileNameBuilder.ts), so the literal
 * separator character used in the default pattern doesn't affect behavior on
 * either OS.
 */
export function newNamingConfigDefault(): Omit<NamingConfig, keyof ModelBase> & { id: number } {
  return {
    id: 0,
    renameBooks: false,
    replaceIllegalCharacters: true,
    colonReplacementFormat: ColonReplacementFormat.Smart,
    standardBookFormat: "{Book Title}/{Author Name} - {Book Title}{ (PartNumber)}",
    authorFolderFormat: "{Author Name}",
  };
}

/** Ported from NzbDrone.Core/Organizer/BasicNamingConfig.cs. Not persisted -- computed by FileNameBuilder.GetBasicNamingConfig from a NamingConfig's StandardBookFormat. */
export interface BasicNamingConfig {
  includeAuthorName: boolean;
  includeBookTitle: boolean;
  includeQuality: boolean;
  replaceSpaces: boolean;
  separator: string;
  numberStyle: string | null;
}

export function newBasicNamingConfig(): BasicNamingConfig {
  return {
    includeAuthorName: false,
    includeBookTitle: false,
    includeQuality: false,
    replaceSpaces: false,
    separator: "",
    numberStyle: null,
  };
}
