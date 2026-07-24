/**
 * Ported from Readarr.Api.V1/Author/AuthorEditorDeleteResource.cs.
 *
 * Dead-code note preserved faithfully: like the real C# source, nothing in
 * this module's `AuthorEditorController` actually deserializes a request
 * body into this shape -- `DeleteAuthor` in the real controller (and this
 * port's `AuthorEditorController.ts`) takes `[FromBody] AuthorEditorResource`
 * instead, reading only its `AuthorIds` field and hardcoding
 * `deleteFiles: false` (see AuthorEditorController.cs's `DeleteAuthor`
 * method, which never references `AuthorEditorDeleteResource` at all despite
 * this type existing in the same directory specifically to describe that
 * request). Ported here anyway for shape-fidelity with the real 9-file
 * directory.
 */
export interface AuthorEditorDeleteResource {
  authorIds: number[];
  deleteFiles: boolean;
}
