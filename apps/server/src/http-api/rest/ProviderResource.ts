import type { IProviderConfig, ProviderDefinition } from "../../thingi-provider/index.js";
import { ProviderMessage } from "../../thingi-provider/index.js";
import type { Field } from "../client-schema/Field.js";
import {
  buildFieldSchema,
  readFromFieldSchema,
  type FieldDefinition,
} from "../client-schema/SchemaBuilder.js";
import type { RestResource } from "./RestResource.js";

/**
 * Ported from Readarr.Api.V1/ProviderResource.cs's `ProviderResource<T>` +
 * `ProviderResourceMapper<TProviderResource, TProviderDefinition>`.
 *
 * `T` in the real C# generic (`ProviderResource<T> : RestResource`, with
 * `Presets: List<T>`) is always the concrete resource's own type
 * (self-referential -- e.g. `IndexerResource : ProviderResource<IndexerResource>`)
 * so `Presets` holds a list of the same resource shape. This port models
 * that the same way: `ProviderResource<TSettingsWire>` is generic only over
 * the settings' wire representation; `presets` is typed as
 * `ProviderResource<TSettingsWire>[]`, which is exactly the self-referential
 * shape the C# generic produces once resolved to a concrete resource type.
 *
 * `TSettingsWire` here is intentionally just "the wire body" -- concrete
 * provider-kind modules (Indexers/DownloadClients/Notifications/ImportLists)
 * don't need a distinct wire-vs-domain settings type; `fields: Field[]` IS
 * the wire settings representation (matches C#: `Fields` is the only
 * settings-carrying member on the resource, there is no separate typed
 * settings property on `ProviderResource` itself).
 */
export interface ProviderResource extends RestResource {
  name: string;
  fields: Field[];
  implementationName: string;
  implementation: string;
  configContract: string | null;
  infoLink: string;
  message: ProviderMessage | null;
  tags: number[];
  presets?: ProviderResource[];
}

/**
 * The explicit, per-provider-kind wiring a concrete Phase 5 controller
 * supplies to `providerResourceMapper()` below: how to turn its own
 * `TProviderConfig` settings type into/out of a `Field[]` wire array. This
 * is the direct substitute for C#'s `SchemaBuilder.ToSchema`/
 * `ReadFromSchema`'s reflection-driven `ConfigContract`-name -> `Type`
 * lookup (`ReflectionExtensions.CoreAssembly.FindTypeByName(...)`) -- since
 * this port has no assembly-wide type registry, a concrete module passes
 * its settings' `FieldDefinition[]` and a zero-arg factory directly instead
 * of a contract-name string the mapper would have to resolve itself.
 */
export interface ProviderSettingsSchema<TProviderConfig extends IProviderConfig> {
  fieldDefs: FieldDefinition<TProviderConfig>[];
  createDefaultSettings: () => TProviderConfig;
}

/**
 * Ported from `ProviderResourceMapper.ToResource`/`ToModel`.
 *
 * Real C# `ToResource` also formats `InfoLink` as
 * `"https://wiki.servarr.com/readarr/supported#{implementation}"` -- kept
 * as a parameter (`wikiSlug`) rather than hardcoded "readarr" so a Pagarr
 * fork of the wiki URL (or an eventual "pagarr" slug) doesn't require
 * editing this shared module; defaults to `"readarr"` to match the real
 * source's literal value exactly when a caller doesn't override it.
 */
export function providerResourceMapper<TProviderConfig extends IProviderConfig>(
  settingsSchema: ProviderSettingsSchema<TProviderConfig>,
  wikiSlug = "readarr"
): {
  toResource: (definition: ProviderDefinition<TProviderConfig>) => ProviderResource;
  toModel: (resource: ProviderResource | null | undefined) => ProviderDefinition<TProviderConfig>;
} {
  return {
    toResource(definition: ProviderDefinition<TProviderConfig>): ProviderResource {
      return {
        id: definition.id,
        name: definition.name,
        implementationName: definition.implementationName,
        implementation: definition.implementation,
        configContract: definition.configContract,
        message: definition.message,
        tags: definition.tags,
        fields: definition.settings
          ? buildFieldSchema(definition.settings, settingsSchema.fieldDefs)
          : [],
        infoLink: `https://wiki.servarr.com/${wikiSlug}/supported#${definition.implementation.toLowerCase()}`,
      };
    },

    toModel(resource: ProviderResource | null | undefined): ProviderDefinition<TProviderConfig> {
      if (!resource) {
        return {
          id: 0,
          name: "",
          implementationName: "",
          implementation: "",
          configContract: null,
          enable: false,
          message: null,
          tags: [],
          settings: null,
        };
      }

      const settings = readFromFieldSchema(
        resource.fields,
        settingsSchema.fieldDefs,
        settingsSchema.createDefaultSettings
      );

      return {
        id: resource.id,
        name: resource.name,
        implementationName: resource.implementationName,
        implementation: resource.implementation,
        configContract: resource.configContract,
        // Ported: `Enable` is NOT a member of the real C# `ProviderResource<T>`
        // base at all -- it's declared bool (C# default `false`) on
        // `ProviderDefinition` itself, and every concrete resource
        // subclass (IndexerResource, DownloadClientResource, etc.) adds
        // its own `Enable`/`EnableRss`-shaped field(s) ON TOP of this
        // generic base, whose values flow into the definition via that
        // subclass's own mapper override -- this generic base's ToModel
        // has no `Enable` source to read from at all. Defaulted to
        // `false` here to match ProviderDefinition's real C# default
        // exactly; a concrete provider-kind resource that adds its own
        // enable field must set `enable` itself (e.g. by calling this
        // base mapper's `toModel()` first, then overwriting `.enable`
        // with its own field's value) -- do not rely on this default for
        // any resource that has a real enable/enableRss concept.
        enable: false,
        message: resource.message,
        tags: resource.tags,
        settings,
      };
    },
  };
}

export { ProviderMessage };
