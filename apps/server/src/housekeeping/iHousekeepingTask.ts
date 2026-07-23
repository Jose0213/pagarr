/**
 * Ported from NzbDrone.Core/Housekeeping/IHousekeepingTask.cs.
 *
 * C#: `public interface IHousekeepingTask { void Clean(); }` -- implemented
 * by every one of the 33 concrete `Housekeepers/*.cs` tasks and resolved as
 * `IEnumerable<IHousekeepingTask>` by DI into `HousekeepingService`. Per
 * this port's explicit-registry convention (no DI container), the
 * "IEnumerable<IHousekeepingTask>" resolution becomes an explicit array a
 * caller builds and passes to `HousekeepingService`'s constructor -- see
 * that file's doc comment.
 *
 * `clean()` is typed `void | Promise<void>`, not a bare sync `void`: unlike
 * every other housekeeper (plain synchronous SQL), `DeleteBadMediaCovers`
 * does real disk I/O per author and this port's disk-provider seams
 * (`root-folders/disk-provider.ts`, `media-files-organize/diskProvider.ts`)
 * are synchronous today, but `HousekeepingService.clean()` awaits each task
 * regardless so a future async disk provider doesn't require touching this
 * interface again.
 */
export interface IHousekeepingTask {
  clean(): void | Promise<void>;
}
