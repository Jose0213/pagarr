/**
 * Ported from Readarr.Api.V1/Indexers/IndexerFlagResource.cs.
 *
 * C#: `[JsonProperty(DefaultValueHandling = DefaultValueHandling.Include)]
 * public new int Id { get; set; }` -- overrides `RestResource.Id`'s
 * `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]` so
 * `IndexerFlagResource` ALWAYS serializes `"id"` even when it's `0`
 * (unlike every other `RestResource`-derived DTO in this port, which omits
 * a zero id via `stripDefaultId()` -- see rest/RestResource.ts). This
 * matters here because flag values start at 1 in the real bitmask
 * (`Freeleech = 1`), so `id: 0` never actually occurs for a real flag -- but
 * the override is preserved faithfully by simply NOT running this
 * resource's list through `stripDefaultId()` in IndexerFlagController.ts,
 * rather than by any special-casing here.
 *
 * `NameLower` is a computed get-only property (`Name.ToLowerInvariant()`),
 * ported as `nameLower` set once at construction time (`createIndexerFlagResource`)
 * rather than a live getter, matching this port's plain-data-interface
 * convention (no interface carries behavior -- see RestResource.ts's doc
 * comment for the general pattern).
 */
export interface IndexerFlagResource {
  id: number;
  name: string;
  nameLower: string;
}

export function createIndexerFlagResource(id: number, name: string): IndexerFlagResource {
  return { id, name, nameLower: name.toLowerCase() };
}
