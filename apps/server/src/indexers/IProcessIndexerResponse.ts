import type { IndexerResponse } from "./IndexerResponse.js";
import type { ReleaseInfo } from "./releaseInfo.js";

/** Ported from NzbDrone.Core/Indexers/IProcessIndexerResponse.cs. */
export interface IParseIndexerResponse {
  parseResponse(indexerResponse: IndexerResponse): ReleaseInfo[];
}
