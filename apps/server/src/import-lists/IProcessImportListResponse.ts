import type { ImportListItemInfo } from "../parser/model/importListItemInfo.js";
import type { ImportListResponse } from "./ImportListResponse.js";

/**
 * Ported from NzbDrone.Core/ImportLists/IProcessImportListResponse.cs
 * (`IParseImportListResponse`).
 */
export interface IParseImportListResponse {
  parseResponse(importListResponse: ImportListResponse): ImportListItemInfo[];
}
