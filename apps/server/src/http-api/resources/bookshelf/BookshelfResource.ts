import type { MonitoringOptions, NewItemMonitorTypes } from "../../../books/models.js";
import type { BookshelfAuthorResource } from "./BookshelfAuthorResource.js";

/**
 * Ported from Readarr.Api.V1.Bookshelf/BookshelfResource.cs. Plain
 * request-body shape (not a RestResource) -- `BookshelfController`'s single
 * `POST /` bulk-monitoring-update request body.
 */
export interface BookshelfResource {
  authors: BookshelfAuthorResource[];
  monitoringOptions?: MonitoringOptions | null;
  monitorNewItems?: NewItemMonitorTypes | null;
}
