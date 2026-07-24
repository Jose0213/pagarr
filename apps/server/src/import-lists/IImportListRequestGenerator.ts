import type { ImportListPageableRequestChain } from "./ImportListPageableRequestChain.js";

/**
 * Ported from NzbDrone.Core/ImportLists/IImportListRequestGenerator.cs.
 *
 * DEVIATION -- async: matches `indexers/IIndexerRequestGenerator.ts`'s same
 * deviation (see that file's doc comment on `HttpIndexerBase`). No concrete
 * ImportLists request generator in this module actually needs to await
 * anything before building its request chain (unlike Newznab's capabilities
 * lookup) -- kept `async`-shaped anyway for interface consistency with the
 * sibling Indexers module and so a future generator with a real async
 * dependency doesn't need an interface-breaking change.
 */
export interface IImportListRequestGenerator {
  getListItems(): Promise<ImportListPageableRequestChain>;
}
