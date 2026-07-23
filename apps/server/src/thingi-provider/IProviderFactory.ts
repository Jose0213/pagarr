import type { IProvider } from "./IProvider.js";
import type { IProviderConfig, ValidationResult } from "./IProviderConfig.js";
import type { ProviderDefinition } from "./ProviderDefinition.js";

/**
 * Ported from NzbDrone.Core/ThingiProvider/IProviderFactory.cs.
 */
export interface IProviderFactory<
  TProvider extends IProvider<TProviderConfig>,
  TProviderConfig extends IProviderConfig = IProviderConfig,
> {
  all(): ProviderDefinition<TProviderConfig>[];
  getAvailableProviders(): TProvider[];
  exists(id: number): boolean;
  find(id: number): ProviderDefinition<TProviderConfig> | undefined;
  get(id: number): ProviderDefinition<TProviderConfig>;
  getMany(ids: number[]): ProviderDefinition<TProviderConfig>[];
  create(definition: ProviderDefinition<TProviderConfig>): ProviderDefinition<TProviderConfig>;
  update(definition: ProviderDefinition<TProviderConfig>): void;
  updateMany(
    definitions: ProviderDefinition<TProviderConfig>[]
  ): ProviderDefinition<TProviderConfig>[];
  delete(id: number): void;
  deleteMany(ids: number[]): void;
  getDefaultDefinitions(): ProviderDefinition<TProviderConfig>[];
  getPresetDefinitions(
    providerDefinition: ProviderDefinition<TProviderConfig>
  ): ProviderDefinition<TProviderConfig>[];
  setProviderCharacteristics(definition: ProviderDefinition<TProviderConfig>): void;
  getInstance(definition: ProviderDefinition<TProviderConfig>): TProvider;
  test(definition: ProviderDefinition<TProviderConfig>): Promise<ValidationResult>;
  requestAction(
    definition: ProviderDefinition<TProviderConfig>,
    action: string,
    query: Record<string, string>
  ): unknown;
  allForTag(tagId: number): ProviderDefinition<TProviderConfig>[];
}
