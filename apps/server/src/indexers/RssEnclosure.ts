/** Ported from NzbDrone.Core/Indexers/RssEnclosure.cs. */
export interface RssEnclosure {
  url: string | null;
  type: string | null;
  length: number;
}
