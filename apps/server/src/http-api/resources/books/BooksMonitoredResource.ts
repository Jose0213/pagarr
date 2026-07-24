/** Ported from Readarr.Api.V1.Books/BooksMonitoredResource.cs. Plain request-body shape, not a RestResource. */
export interface BooksMonitoredResource {
  bookIds: number[];
  monitored: boolean;
}
