import type { IMetadata } from "./metadataBase.js";
import type { MetadataDefinition } from "./metadataDefinition.js";
import type { IMetadataRepository } from "./metadataRepository.js";

/**
 * Ported from NzbDrone.Core/Extras/Metadata/MetadataFactory.cs +
 * NzbDrone.Core/ThingiProvider/ProviderFactory.cs.
 *
 * FORWARD-REFERENCE NARROWING: same approach as
 * indexers/IndexerFactory.ts's `IIndexerFactory` -- rather than port the
 * whole generic `ProviderFactory<TProvider, TProviderDefinition>` base
 * (reflection-based provider construction via DI container,
 * `ProviderAddedEvent`/etc), this takes an already-instantiated
 * `IMetadata[]` (the equivalent of C#'s `IEnumerable<IMetadata> providers`
 * ctor param, minus the DI-container reflection step) and implements
 * exactly the members `MetadataFactory`/`IMetadataFactory` add on top:
 * `InitializeProviders()` (auto-registers a disabled `MetadataDefinition`
 * row for any consumer implementation not yet in the DB) and `Enabled()`
 * (definitions with `.Enable === true`).
 *
 * `GetAvailableProviders()` (used directly by `MetadataService.
 * MoveFilesAfterRename`, which iterates ALL registered consumers
 * regardless of enabled state, unlike the other `MetadataService` methods
 * which use `Enabled()`) is exposed too, since that's real ported behavior
 * from the C# `ProviderFactory` base, not something MetadataFactory itself
 * adds -- returns every provider whose `MetadataDefinition` currently
 * exists (mirroring `ProviderFactory.GetAvailableProviders()`'s "build one
 * live provider instance per persisted definition" contract, narrowed here
 * to the already-instantiated `providers` array joined against
 * `definitions` by `Implementation` name).
 */
export interface IMetadataFactory {
  enabled(): IMetadata[];
  getAvailableProviders(): IMetadata[];
  initializeProviders(): void;
}

export class MetadataFactory implements IMetadataFactory {
  private definitions: MetadataDefinition[] = [];

  constructor(
    private readonly providerRepository: IMetadataRepository,
    private readonly providers: IMetadata[]
  ) {}

  /**
   * Ported from ProviderFactory's constructor call to InitializeProviders()
   * + MetadataFactory.InitializeProviders(): for every live `IMetadata`
   * consumer instance that doesn't already have a `MetadataDefinition` row
   * (matched by `Implementation` = the class name), insert one with
   * `Enable = false` -- new metadata consumers are disabled by default
   * until a user opts in via settings.
   */
  initializeProviders(): void {
    const currentProviders = this.providerRepository.all();

    const newDefinitions: MetadataDefinition[] = this.providers
      .filter((provider) =>
        currentProviders.every((c) => c.implementation !== providerImplementationName(provider))
      )
      .map((provider) => ({
        id: 0,
        enable: false,
        name: provider.name,
        implementation: providerImplementationName(provider),
        settings: null,
        configContract: null,
      }));

    if (newDefinitions.length > 0) {
      this.providerRepository.insertMany(newDefinitions);
    }

    this.definitions = this.providerRepository.all();
  }

  /** Ported from MetadataFactory.Enabled(): GetAvailableProviders().Where(n => ((MetadataDefinition)n.Definition).Enable). */
  enabled(): IMetadata[] {
    const enabledImplementations = new Set(
      this.definitions.filter((d) => d.enable).map((d) => d.implementation)
    );
    return this.providers.filter((provider) =>
      enabledImplementations.has(providerImplementationName(provider))
    );
  }

  /** Ported from ProviderFactory.GetAvailableProviders(): one live instance per currently-persisted definition. See module doc comment. */
  getAvailableProviders(): IMetadata[] {
    const knownImplementations = new Set(this.definitions.map((d) => d.implementation));
    return this.providers.filter((provider) =>
      knownImplementations.has(providerImplementationName(provider))
    );
  }
}

/**
 * Ported from `provider.GetType().Name` -- C# reflection returning the
 * concrete class's simple name, used throughout ProviderFactory/
 * MetadataFactory as the `Implementation` column's join key. TS has no
 * reflection equivalent; concrete `IMetadata` implementations are expected
 * to expose their own class name via `constructor.name` (works for any
 * real `class Foo implements IMetadata` the same way `GetType().Name`
 * would for `class Foo : IMetadata`).
 */
function providerImplementationName(provider: IMetadata): string {
  return (provider as { constructor: { name: string } }).constructor.name;
}
