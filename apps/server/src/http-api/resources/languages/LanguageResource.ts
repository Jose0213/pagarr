import type { RestResource } from "../../rest/RestResource.js";
import { getAllLanguages, languageFromId, type Language } from "../../../languages/language.js";

/**
 * Ported from Readarr.Api.V1/Languages/LanguageResource.cs.
 *
 * C#'s `LanguageResource` overrides `Id` with `[JsonIgnore(Condition =
 * JsonIgnoreCondition.Never)]` -- unlike the base `RestResource.Id`
 * (`WhenWritingDefault`, see rest/RestResource.ts's `stripDefaultId`),
 * language id 0 (`Unknown`) is ALWAYS serialized, never omitted. This
 * resource type therefore is NOT run through `stripDefaultId()` by its
 * router (see LanguageController.ts) -- `restController()`'s automatic
 * `stripDefaultId` application on every response would incorrectly drop
 * `id: 0` for the Unknown language otherwise; the router below bypasses
 * `restController()`'s `getAll`/`getById` machinery for exactly this reason
 * and writes responses directly.
 *
 * `NameLower` (`Name.ToLowerInvariant()`, a computed read-only property) is
 * ported as a plain field computed at construction time in `toResource`,
 * matching the JSON shape every response actually serializes.
 */
export interface LanguageResource extends RestResource {
  id: number;
  name: string;
  nameLower: string;
}

export const LANGUAGE_RESOURCE_NAME = "language";

/** Ported from `LanguageController`'s inline resource construction (there is no separate LanguageResourceMapper in the C# source -- both GetResourceById and GetAll build the resource literal directly). */
export function languageToResource(language: Language): LanguageResource {
  return {
    id: language.id,
    name: language.name,
    nameLower: language.name.toLowerCase(),
  };
}

/** Ported from `LanguageController.GetResourceById(int id)`: `(Language)id` throws (via languageFromId) for an id matching no known language, exactly mirroring the C# explicit-cast exception. */
export function languageResourceById(id: number): LanguageResource {
  return languageToResource(languageFromId(id));
}

/** Ported from `LanguageController.GetAll()`: every known language, ordered by Name (ordinal string sort, matching LINQ's default `OrderBy(l => l.Name)` on strings -- ordinal, not locale-aware). */
export function allLanguageResources(): LanguageResource[] {
  return getAllLanguages()
    .map(languageToResource)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
