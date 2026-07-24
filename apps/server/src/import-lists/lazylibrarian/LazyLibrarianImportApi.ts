/**
 * Ported from NzbDrone.Core/ImportLists/LazyLibrarian/LazyLibrarianImportApi.cs.
 * Plain JSON DTO for a single row of LazyLibrarian's `getAllBooks` API
 * command response.
 *
 * WIRE-SHAPE FIDELITY: field names are PascalCase here, NOT camelCase --
 * this interface describes the raw JSON payload shape as `JSON.parse`
 * actually sees it over the wire, matching the real C# `LazyLibrarianBook`
 * class's property names verbatim (`Newtonsoft.Json` deserializes by exact
 * C# property name; no `[JsonProperty]` attribute or camelCase naming
 * strategy is applied anywhere in this class or its containing
 * `JsonSerializerSettings`, confirmed against the real source). Every other
 * DTO in this port maps camelCase TS fields onto the wire shape via an
 * explicit `rowToModel`-style translation layer (see e.g.
 * `readarr/ReadarrAPIResource.ts`'s camelCase interfaces, which work
 * because `ReadarrV1Proxy` calls the REAL Pagarr HTTP-API layer, itself
 * camelCase) -- this file is the one DTO in this module that has NO such
 * translation layer (`LazyLibrarianImportParser.ts` reads straight off
 * `JSON.parse(...)`'s result), so it must match the wire's actual casing
 * directly or every field silently comes back `undefined`.
 */
export interface LazyLibrarianBook {
  BookName: string | null;
  BookId: string | null;
  BookIsbn: string | null;
  AuthorName: string | null;
  AuthorId: string | null;
}
