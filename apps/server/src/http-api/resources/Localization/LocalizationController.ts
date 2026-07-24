import { Router } from "express";
import type { ILocalizationService } from "../../../localization/localizationService.js";

/**
 * Ported from Readarr.Api.V1/Localization/LocalizationController.cs.
 *
 * ## Wire shape: `{"Strings": {...}}`, PascalCase key, not camelCase
 *
 * `[HttpGet] GetLocalizationDictionary()` returns `string` -- it manually
 * `JsonSerializer.Serialize`s a `LocalizationResource { Strings:
 * Dictionary<string, string> }` using a COPY of the app-wide serializer
 * settings (`STJson.GetSerializerSettings()`, which sets BOTH
 * `DictionaryKeyPolicy` and `PropertyNamingPolicy` to
 * `JsonNamingPolicy.CamelCase` globally -- see enumWireName.ts's doc
 * comment) with this ctor then explicitly NULLING both policies back out
 * (`_serializerSettings.DictionaryKeyPolicy = null;
 * _serializerSettings.PropertyNamingPolicy = null;`) just for this one
 * action's manual serialization call. Net effect: `Strings` (the resource's
 * one property) keeps its raw PascalCase C# member name instead of being
 * camelCased to `strings`, and the dictionary's own keys (`"Cancel"`,
 * `"AppUpdated"`, etc, already the raw en.json keys) are likewise left
 * un-camelCased. `Id` (`RestResource`'s default-0
 * `[JsonIgnore(WhenWritingDefault)]` field -- this resource is never
 * constructed with a non-zero id) is omitted the normal way. The real wire
 * body is therefore `{"Strings": {"Cancel": "Cancel", ...}}` -- ported
 * here as a literal `{ Strings: dictionary }` object, PascalCase key,
 * rather than going through `localizationDictionaryToResource()` +
 * `stripDefaultId` (which would emit `{"strings": {...}}`, the WRONG
 * casing for this specific, deliberately-uncamelCased action).
 */
export interface LocalizationControllerOptions {
  localizationService: ILocalizationService;
}

export function localizationController(options: LocalizationControllerOptions): Router {
  const { localizationService } = options;
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({ Strings: localizationService.getLocalizationDictionary() });
  });

  return router;
}
