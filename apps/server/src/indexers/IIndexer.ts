import type { HttpRequest } from "../http/HttpRequest.js";
import type { DownloadProtocol } from "./DownloadProtocol.js";
import type { IndexerDefinition } from "./IndexerDefinition.js";
import type { ReleaseInfo } from "./releaseInfo.js";
import type { AuthorSearchCriteria, BookSearchCriteria } from "./searchCriteria.js";
import type { ValidationResult } from "./IIndexerSettings.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/IProvider.cs +
 * NzbDrone.Core/Indexers/IIndexer.cs.
 *
 * FORWARD-REFERENCE NARROWING: `IIndexer : IProvider`, where `IProvider`
 * (Name/ConfigContract/Message/DefaultDefinitions/Definition/Test/
 * RequestAction) lives in the not-yet-ported `ThingiProvider` module -- see
 * IndexerDefinition.ts's doc comment for the same rationale. Its members
 * are inlined directly onto `IIndexer` here rather than modeled as a
 * separate `IProvider` interface, since Indexers is the first
 * provider-kind module ported.
 *
 * `Fetch(BookSearchCriteria)` / `Fetch(AuthorSearchCriteria)` are C#
 * overloads by parameter type; TS interfaces support the same call-signature
 * overloading (matching IIndexerRequestGenerator.GetSearchRequests), so both
 * stay named `fetch` here rather than being split into differently-named
 * methods.
 */
export interface IIndexer {
  readonly name: string;
  readonly supportsRss: boolean;
  readonly supportsSearch: boolean;
  readonly protocol: DownloadProtocol;

  definition: IndexerDefinition;

  fetchRecent(): Promise<ReleaseInfo[]>;
  fetch(searchCriteria: BookSearchCriteria): Promise<ReleaseInfo[]>;
  fetch(searchCriteria: AuthorSearchCriteria): Promise<ReleaseInfo[]>;
  getDownloadRequest(link: string): HttpRequest;

  test(): Promise<ValidationResult>;
  requestAction(action: string, query: Record<string, string>): unknown;
}
