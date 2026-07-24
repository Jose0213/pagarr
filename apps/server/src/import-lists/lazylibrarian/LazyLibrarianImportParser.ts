import type { ImportListItemInfo } from "../../parser/model/importListItemInfo.js";
import { newImportListItemInfo } from "../../parser/model/importListItemInfo.js";
import { ImportListException } from "../exceptions/ImportListException.js";
import type { IParseImportListResponse } from "../IProcessImportListResponse.js";
import type { ImportListResponse } from "../ImportListResponse.js";
import type { LazyLibrarianBook } from "./LazyLibrarianImportApi.js";

/**
 * Ported from NzbDrone.Core/ImportLists/LazyLibrarian/LazyLibrarianImportParser.cs.
 */
export class LazyLibrarianImportParser implements IParseImportListResponse {
  parseResponse(importListResponse: ImportListResponse): ImportListItemInfo[] {
    const items: ImportListItemInfo[] = [];

    if (!this.preProcess(importListResponse)) {
      return items;
    }

    let jsonResponse: LazyLibrarianBook[] | null;
    try {
      jsonResponse = JSON.parse(importListResponse.content) as LazyLibrarianBook[] | null;
    } catch {
      // Ported from JsonConvert.DeserializeObject returning null on malformed content --
      // matches the C#'s `if (jsonResponse == null) return items;` branch below.
      return items;
    }

    if (jsonResponse === null) {
      return items;
    }

    for (const item of jsonResponse) {
      const info = newImportListItemInfo();
      info.author = item.AuthorName;
      info.book = item.BookName;
      info.editionGoodreadsId = item.BookId;

      // Ported from `items.AddIfNotNull(...)`: LINQ's AddIfNotNull is a
      // no-op when the item itself is null, which a freshly-constructed
      // ImportListItemInfo object literal never is here -- every parsed
      // JSON row always yields a non-null info object (unlike C#, there's
      // no scenario where the mapping itself could produce null). Kept as
      // an unconditional push for that reason; faithful in effect.
      items.push(info);
    }

    return items;
  }

  /** Ported from `LazyLibrarianImportParser.PreProcess(ImportListResponse)`. */
  protected preProcess(importListResponse: ImportListResponse): boolean {
    if (importListResponse.httpResponse.statusCode !== 200) {
      throw new ImportListException(
        importListResponse,
        "Import List API call resulted in an unexpected StatusCode [{0}]",
        importListResponse.httpResponse.statusCode
      );
    }

    const contentType = importListResponse.httpResponse.headers.get("Content-Type");
    const acceptHeader = importListResponse.httpRequest.headers.get("Accept");

    if (
      contentType &&
      contentType.includes("text/json") &&
      acceptHeader &&
      !acceptHeader.includes("text/json")
    ) {
      throw new ImportListException(
        importListResponse,
        "Import List responded with html content. Site is likely blocked or unavailable."
      );
    }

    return true;
  }
}
