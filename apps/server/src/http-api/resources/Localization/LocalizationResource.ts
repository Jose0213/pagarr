import type { RestResource } from "../../rest/RestResource.js";

/**
 * Ported from Readarr.Api.V1/Localization/LocalizationResource.cs.
 *
 * The real `LocalizationController` doesn't actually serve THIS shape on
 * the wire, despite `LocalizationResourceMapper` existing -- see
 * LocalizationController.ts's doc comment for why `GetLocalizationDictionary()`
 * returns the flat dictionary directly, not `{ strings: {...} }`. This
 * interface/mapper pair is kept for shape fidelity with the real C# source
 * files (a faithful 1:1 port of what exists, even though the controller
 * action itself bypasses it) rather than omitted.
 */
export interface LocalizationResource extends RestResource {
  strings: Record<string, string>;
}

/** Ported from `LocalizationResourceMapper.ToResource(this Dictionary<string, string> localization)`. */
export function localizationDictionaryToResource(
  dictionary: Record<string, string>
): LocalizationResource {
  return { id: 0, strings: dictionary };
}
