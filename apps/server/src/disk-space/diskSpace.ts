/**
 * Ported from NzbDrone.Core/DiskSpace/DiskSpace.cs.
 *
 * NOTE: unlike almost every other domain model in this port, the real C#
 * `DiskSpace` class is NOT a `ModelBase` -- it has no `Id`/database
 * identity at all (`DiskSpaceService.GetFreeSpace()` computes this list
 * fresh on every call from live filesystem probes + RootFolders, never
 * persisted). This interface intentionally does NOT extend `ModelBase` for
 * that reason; see `http-api/resources/DiskSpace/DiskSpaceResource.ts` for
 * how the API layer's `RestResource` (which DOES require an `id`) copes
 * with an underlying model that has none.
 */
export interface DiskSpace {
  path: string;
  label: string;
  freeSpace: number;
  totalSpace: number;
}
