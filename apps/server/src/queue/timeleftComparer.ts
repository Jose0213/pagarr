/**
 * Ported from NzbDrone.Core/Queue/TimeleftComparer.cs.
 *
 * C#'s `TimeSpan?` is ported as milliseconds (`number | null`) throughout
 * this port (see e.g. queue.ts's `QueueItem.timeleft` doc comment) --
 * plain numeric comparison below matches C#'s `TimeSpan` comparison
 * operators exactly.
 */
export class TimeleftComparer {
  compare(x: number | null, y: number | null): number {
    if (x === null && y === null) {
      return 0;
    }

    if (x === null && y !== null) {
      return 1;
    }

    if (x !== null && y === null) {
      return -1;
    }

    if (x! > y!) {
      return 1;
    }

    if (x! < y!) {
      return -1;
    }

    return 0;
  }
}
