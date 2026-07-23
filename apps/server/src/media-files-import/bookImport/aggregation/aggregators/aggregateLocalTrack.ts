/** Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/Aggregators/IAggregateLocalTrack.cs. */
export interface IAggregate<T> {
  aggregate(item: T, otherFiles: boolean): T;
}
