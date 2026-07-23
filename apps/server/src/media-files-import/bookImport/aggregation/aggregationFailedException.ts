/**
 * Ported from NzbDrone.Core/MediaFiles/BookImport/Aggregation/AggregationFailedException.cs.
 * C# class name is `AugmentingFailedException` (the file is misnamed
 * relative to its class, same as `ImportArtistDefaults.cs`/
 * `ImportAuthorDefaults` -- see importAuthorDefaults.ts) -- ported here
 * under the class's real name.
 */
export class AugmentingFailedException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AugmentingFailedException";
  }
}
