/**
 * Ported from the slice of NzbDrone.Common/Extensions/IEnumerableExtensions.cs
 * this module's Identification subsystem actually calls (`MostCommon`).
 * Not tied to any one file in the real source -- shared across
 * candidateService.ts, distanceCalculator.ts, trackGroupingService.ts,
 * same as the C# extension method is shared via `using
 * NzbDrone.Common.Extensions`.
 */

/** Ported from the `MostCommon<TSource>(this IEnumerable<TSource> items)` overload. */
export function mostCommonOf<T>(items: T[]): T {
  return mostCommon(items, (x) => x);
}

/**
 * Ported from `MostCommon<TSource, TResult>(this IEnumerable<TSource>
 * items, Func<TSource, TResult> predicate)`: groups by the projected
 * value, orders descending by group size, returns the first group's key.
 * Ties broken by first-seen-group-order, matching LINQ's `GroupBy` +
 * `OrderByDescending`'s stable-sort semantics.
 */
export function mostCommon<TSource, TResult>(
  items: TSource[],
  predicate: (item: TSource) => TResult
): TResult {
  const order: TResult[] = [];
  const counts = new Map<TResult, number>();

  for (const item of items) {
    const key = predicate(item);
    const existing = counts.get(key);
    if (existing === undefined) {
      counts.set(key, 1);
      order.push(key);
    } else {
      counts.set(key, existing + 1);
    }
  }

  let best = order[0] as TResult;
  let bestCount = -1;
  for (const key of order) {
    const count = counts.get(key) ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }

  return best;
}

/**
 * Ported from the `GroupBy(x => keyFn(x)).OrderByDescending(x =>
 * x.Count()).First().First()` pattern used at a couple of real call sites
 * (`DistanceCalculator.BookDistance`'s file-authors lookup,
 * `CandidateService.GetRemoteCandidates`'s author-tags lookup): groups
 * `items` by a computed string key, picks the largest group (first-seen
 * order breaks ties), and returns that group's FIRST ORIGINAL item -- not
 * the key itself. Needed wherever the grouping key is a lossy projection
 * of the original value (e.g. an array joined to a string) that the C#
 * source's `.First()` recovers by returning the actual group member, not
 * `x.Key`.
 */
export function mostCommonKeyed<T>(items: T[], keyFn: (item: T) => string): T {
  const order: string[] = [];
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const bucket = groups.get(key);
    if (bucket === undefined) {
      groups.set(key, [item]);
      order.push(key);
    } else {
      bucket.push(item);
    }
  }

  let bestKey = order[0] as string;
  let bestCount = -1;
  for (const key of order) {
    const count = groups.get(key)?.length ?? 0;
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  return groups.get(bestKey)![0] as T;
}
