/**
 * Ported from NzbDrone.Core/Profiles/Qualities/QualityIndex.cs.
 *
 * C# implemented IComparable/IComparable<QualityIndex> for use in sort
 * contexts; TypeScript has no operator-overload equivalent, so `compareTo`
 * is kept as a plain method (same semantics, same default
 * `respectGroupOrder = true` as the two-arg C# overloads that delegate to
 * the three-arg one).
 */
export class QualityIndex {
  index: number;
  groupIndex: number;

  constructor(index = 0, groupIndex = 0) {
    this.index = index;
    this.groupIndex = groupIndex;
  }

  compareTo(other: QualityIndex | null, respectGroupOrder = true): number {
    if (other === null) {
      return 1;
    }

    const indexCompare = compareNumbers(this.index, other.index);

    if (respectGroupOrder && indexCompare === 0) {
      return compareNumbers(this.groupIndex, other.groupIndex);
    }

    return indexCompare;
  }
}

function compareNumbers(a: number, b: number): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}
