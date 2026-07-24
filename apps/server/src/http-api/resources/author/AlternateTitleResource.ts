/**
 * Ported from Readarr.Api.V1/Author/AlternateTitleResource.cs.
 *
 * Dead-code note preserved faithfully: this DTO exists in the real C#
 * source but is never referenced by any other file in `Readarr.Api.V1/
 * Author/` -- `AuthorResource` has no `AlternateTitles` field (the C#
 * comment on `AuthorResource` even says "//AlternateTitles" as a stale
 * TODO marker in two places, never followed through). Ported here anyway
 * for shape-fidelity with the real 9-file directory this task ports, not
 * because anything in this module's own router wiring constructs one.
 */
export interface AlternateTitleResource {
  title: string;
  seasonNumber: number | null;
  sceneSeasonNumber: number | null;
}
