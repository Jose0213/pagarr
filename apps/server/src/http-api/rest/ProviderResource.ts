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

/**
 * A single extra top-level resource field spec -- the real wire JSON
 * property name plus its default value when a live definition never set
 * it. Same `{key, defaultValue}` shape every concrete `*Resource.ts` module
 * in this codebase already declares for its own extra fields (e.g.
 * `DownloadClientResource.ts`'s `DOWNLOAD_CLIENT_EXTRA_FIELDS`,
 * `NotificationResource.ts`'s `NOTIFICATION_EXTRA_FIELDS`,
 * `MetadataResource.ts`'s `METADATA_EXTRA_FIELDS`, `IndexerResource.ts`'s
 * five fields declared inline instead of as a spec array since Indexers'
 * mapper is hand-written rather than built from this helper).
 */
export interface ExtraProviderFieldSpec {
  key: string;
  defaultValue: unknown;
}

/**
 * Builds a `resourceMapper` for `providerControllerBase()`'s `resourceMapper`
 * option (see that module's doc comment's "resourceMapper" section) that
 * wraps the generic `providerResourceMapper()` and copies a fixed list of
 * extra top-level fields directly to/from IDENTICALLY-NAMED properties on
 * the definition -- the exact mechanism the real C# `ProviderResourceMapper`
 * subclasses use (e.g. `IndexerResourceMapper.ToResource` setting
 * `resource.EnableRss = definition.EnableRss`), just generic over an
 * arbitrary field list instead of hand-writing each assignment.
 *
 * This is the REPLACEMENT for `resources/extraProviderFields.ts`'s
 * `wrapProviderRouterWithExtraFields()` HTTP-middleware-based approach
 * (hoisting extra fields into reserved `$$`-prefixed `Field[]` entries so
 * they round-trip through the generic settings-schema pipeline) -- that
 * approach was itself a workaround for this exact seam not existing yet.
 * With a real `resourceMapper` injection point, extra fields need no
 * detour through `settings`/`fields[]` at all: `toModel`/`toResource` read/
 * write them as real properties on the definition directly, matching how
 * a concrete `ProviderDefinition` subtype (e.g. `DownloadClientDefinition`,
 * `NotificationDefinition`) already declares them as real fields.
 *
 * Suitable for the common case where every extra field is a plain,
 * unconditional property copy in both directions (DownloadClient/
 * Notifications/Metadata's own `*_EXTRA_FIELDS` specs are all exactly this
 * shape -- see each module's own doc comment). A controller needing
 * bespoke per-field logic beyond a straight copy (computed values,
 * validation side effects) should build its own `resourceMapper` by hand
 * instead (as `Indexers/IndexerController.ts`'s
 * `dispatchingIndexerResourceMapper()` does), or wrap this helper's output.
 */
export function extraFieldsProviderResourceMapper<
  TProviderConfig extends IProviderConfig,
  TDefinition extends ProviderDefinition<TProviderConfig>,
  TResource extends ProviderResource,
>(
  settingsSchema: ProviderSettingsSchema<TProviderConfig>,
  extraFields: readonly ExtraProviderFieldSpec[],
  wikiSlug = "readarr"
): {
  toResource: (definition: TDefinition) => TResource;
  toModel: (resource: TResource | null | undefined) => TDefinition;
} {
  const base = providerResourceMapper<TProviderConfig>(settingsSchema, wikiSlug);

  return {
    toResource(definition: TDefinition): TResource {
      const resource = base.toResource(definition) as unknown as Record<string, unknown>;
      const source = definition as unknown as Record<string, unknown>;

      for (const spec of extraFields) {
        resource[spec.key] = source[spec.key] ?? spec.defaultValue;
      }

      return resource as unknown as TResource;
    },

    toModel(resource: TResource | null | undefined): TDefinition {
      const definition = base.toModel(resource) as unknown as Record<string, unknown>;
      const source = (resource ?? {}) as unknown as Record<string, unknown>;

      for (const spec of extraFields) {
        definition[spec.key] = spec.key in source ? source[spec.key] : spec.defaultValue;
      }

      return definition as unknown as TDefinition;
    },
  };
}

export { ProviderMessage };
