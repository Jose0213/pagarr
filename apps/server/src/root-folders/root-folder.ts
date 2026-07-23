import type { ModelBase } from "../db/model-base.js";

/**
 * Ported from NzbDrone.Core/RootFolders/RootFolder.cs.
 *
 * Deviation: the real `RootFolder.DefaultMonitorOption`/`DefaultNewItemMonitorOption`
 * are `MonitorTypes`/`NewItemMonitorTypes` enums, and `CalibreSettings` is a
 * type from the `Books`/`Books.Calibre` modules -- none of that is ported yet
 * (Books is a separate, still-unported Phase 1 module; see PORT_PLAN.md).
 * Rather than block this module on Books, or invent throwaway names that
 * would collide with the real port later, this defines minimal local
 * stand-ins (`MonitorType`, `NewItemMonitorType`, `CalibreSettings`) that
 * mirror the real C# enums'/class's shape exactly (same member names/values,
 * same fields). When the Books module lands, these should be deleted here
 * and this file should import the real types instead -- the wire shape
 * (numeric enum ordinal, JSON-serialized settings object) is identical
 * either way, so no data migration is needed.
 */

/** Mirrors NzbDrone.Core/Books/Model/MonitorTypes.cs. */
export enum MonitorType {
  All = 0,
  Future = 1,
  Missing = 2,
  Existing = 3,
  Latest = 4,
  First = 5,
  None = 6,
  Unknown = 7,
}

/** Mirrors NzbDrone.Core/Books/Model/NewItemMonitorTypes.cs. */
export enum NewItemMonitorType {
  All = 0,
  None = 1,
  New = 2,
}

/**
 * Mirrors the persisted fields of NzbDrone.Core/Books/Calibre/CalibreSettings.cs
 * (an `IEmbeddedDocument`, JSON-serialized into the RootFolders.CalibreSettings
 * column -- see root-folder-repository.ts). `OutputProfile` is ported as the
 * raw `int` the C# class itself stores (it wraps a `CalibreProfile` enum only
 * at the API-resource layer, not in the persisted model).
 */
export interface CalibreSettings {
  host: string | null;
  port: number;
  urlBase: string | null;
  username: string | null;
  password: string | null;
  library: string | null;
  outputFormat: string | null;
  outputProfile: number;
  useSsl: boolean;
}

export interface RootFolder extends ModelBase {
  name: string | null;
  path: string;
  defaultMetadataProfileId: number;
  defaultQualityProfileId: number;
  defaultMonitorOption: MonitorType;
  defaultNewItemMonitorOption: NewItemMonitorType;
  /** C# `HashSet<int>`, JSON-array-serialized in the DB (see root-folder-repository.ts). */
  defaultTags: Set<number>;
  isCalibreLibrary: boolean;
  calibreSettings: CalibreSettings | null;

  /**
   * These three are computed at read time (disk probe), never persisted --
   * TableMapping.Map() explicitly `.Ignore()`s them for the RootFolders
   * table. See root-folder-repository.ts.
   */
  accessible: boolean;
  freeSpace: number | null;
  totalSpace: number | null;
}

/** Ported from NzbDrone.Core/RootFolders/UnmappedFolder.cs. */
export interface UnmappedFolder {
  name: string | null;
  path: string;
}
