import type { QualityModel } from "../../../qualities/qualityModel.js";

/**
 * Ported from Readarr.Api.V1/BookFiles/BookFileListResource.cs. Not a
 * `RestResource` in the C# source either (plain DTO, no `Id`/`ResourceName`)
 * -- used by the `PUT editor`/`DELETE bulk` bodies only.
 */
export interface BookFileListResource {
  bookFileIds: number[];
  quality?: QualityModel | null;
}
