// Ported from NzbDrone.Core/Http/CachedHttpResponse.cs
//
// C#'s ModelBase contributes just an `Id` (int, DB primary key) -- ported
// as a plain field here rather than a base class, since the Datastore
// module (ported in parallel) owns what ModelBase actually means in this
// port (e.g. whether Id is a number or a string uuid). Whichever shape
// Datastore lands with, this record's Id field should match it.

export interface CachedHttpResponse {
  id: number;
  url: string;
  lastRefresh: Date;
  expiry: Date;
  value: string;
  statusCode: number;
}
