/** Ported from Readarr.Api.V1.Books/BookEditorResource.cs. Plain request-body shape, not a RestResource. */
export interface BookEditorResource {
  bookIds: number[];
  monitored?: boolean | null;
  deleteFiles?: boolean | null;
  addImportListExclusion?: boolean | null;
}
