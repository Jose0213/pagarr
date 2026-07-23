/**
 * Ported from NzbDrone.Core/Queue/EstimatedCompletionTimeComparer.cs.
 *
 * C#'s `DateTime?` is ported as an ISO 8601 string or `null` throughout
 * this port (see e.g. queue.ts's `QueueItem.estimatedCompletionTime` doc
 * comment); string comparison of ISO 8601 timestamps is lexicographically
 * equivalent to chronological comparison, so `<`/`>` below match C#'s
 * `DateTime` comparison operators exactly for same-format inputs.
 */
export class EstimatedCompletionTimeComparer {
  compare(x: string | null, y: string | null): number {
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
