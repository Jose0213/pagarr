import type { IProvider } from "./IProvider.js";
import type { IProviderConfig, ValidationResult } from "./IProviderConfig.js";
import type { IProviderFactory } from "./IProviderFactory.js";
import type { IProviderRepository } from "./IProviderRepository.js";
import { createProviderDefinition, type ProviderDefinition } from "./ProviderDefinition.js";
import { ProviderAddedEvent } from "./events/ProviderAddedEvent.js";
import { ProviderDeletedEvent } from "./events/ProviderDeletedEvent.js";
import { ProviderUpdatedEvent } from "./events/ProviderUpdatedEvent.js";

/** Minimal logger surface ProviderFactory needs -- matches the sibling factories' own `XFactoryLogger`. */
export interface ProviderFactoryLogger {
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
}

const noopLogger: ProviderFactoryLogger = {
  debug: () => {},
  trace: () => {},
  warn: () => {},
};

/**
 * Minimal event-publishing seam this factory needs. Matches
 * `db/events.ts`'s `IEventAggregator` shape/rationale (Messaging/event bus
 * not yet ported) but widened to accept the three ThingiProvider event
 * types above rather than only `ModelEvent`.
 */
export interface ProviderFactoryEventAggregator {
  publishEvent(
    event: ProviderAddedEvent<never> | ProviderUpdatedEvent<never> | ProviderDeletedEvent
  ): void;
}

class NullProviderFactoryEventAggregator implements ProviderFactoryEventAggregator {
  publishEvent(): void {
    // Intentional no-op, matching db/events.ts's NullEventAggregator.
  }
}

/**
 * Ported from NzbDrone.Core/ThingiProvider/ProviderFactory.cs.
 *
 * This is the real generic base `IndexerFactory`/`DownloadClientFactory`
 * were each independently narrowed from -- both siblings' own doc comments
 * spell out exactly what they left out and why (see
 * `indexers/IndexerFactory.ts`'s "FORWARD-REFERENCE NARROWING" comment):
 * DI-container reflection-based provider instantiation
 * (`_container.GetRequiredService(type)`), `RemoveMissingImplementations()`
 * at `ApplicationStartedEvent`, `GetDefaultDefinitions()`/
 * `GetPresetDefinitions()` (both driven by each live provider's
 * `DefaultDefinitions`), and full CRUD-with-event-publication. They kept
 * only the "given already-instantiated providers, filter/test them" slice
 * their own module actually needed at the time. They are NOT retrofitted to
 * extend this base (out of scope per this task's brief).
 *
 * This port implements the FULL surface `IProviderFactory<TProvider,
 * TProviderDefinition>` declares, matching this task's explicit
 * "generic, reusable base" requirement:
 *   - `getInstance()`: since there's no DI container/reflection in this
 *     port, provider-type lookup uses an explicit `Map<string, () =>
 *     TProvider>` factory-function registry keyed by `Implementation`
 *     (passed into the constructor) -- the direct "explicit over
 *     reflection" substitute for `_container.GetRequiredService(type)` +
 *     `GetImplementation()`'s `_providers.Select(c =>
 *     c.GetType()).SingleOrDefault(...)` type lookup. A concrete module
 *     (e.g. Notifications) registers each concrete implementation's factory
 *     function up front instead of relying on reflection/DI scanning.
 *   - `Handle(ApplicationStartedEvent)` (`RemoveMissingImplementations()` +
 *     `InitializeProviders()`) is ported as a plain `initialize()` method a
 *     caller invokes explicitly (no ApplicationStartedEvent bus yet, same
 *     seam-not-wired pattern as `ProviderStatusServiceBase.
 *     handleProviderDeleted()`).
 *   - `Active()` filters by `definition.enable` truthy AND
 *     `settings.validate().isValid` -- ported faithfully from `c =>
 *     c.Settings.Validate().IsValid` (NOTE: the real C# `Active()` filters
 *     ONLY on `Settings.Validate().IsValid`, NOT on `.Enable` at all --
 *     see the source read above: `return All().Where(c =>
 *     c.Settings.Validate().IsValid).ToList();`. This looked like it could
 *     be a bug worth "fixing", but per this task's brief ("faithful port...
 *     known bugs get fixed later, separately") it's preserved exactly:
 *     Active() alone does NOT check Enable. The sibling
 *     IndexerFactory/DownloadClientFactory's own `activeProviders()` DO
 *     filter by their enabled-flag, but that's because Indexers/
 *     DownloadClients's `RssEnabled`/`DownloadHandlingEnabled` methods are
 *     narrowed forward-references to `GetAvailableProviders()`, which in
 *     the real C# base is `Active().Select(GetInstance).ToList()` -- i.e.
 *     the *enabled* filtering those siblings do is real Indexer/
 *     DownloadClient-specific business logic layered on top, not
 *     `ProviderFactory.Active()` itself. This port's `active()` matches the
 *     literal C# `ProviderFactory.Active()` body.)
 */
export class ProviderFactory<
  TProvider extends IProvider<TProviderConfig>,
  TProviderConfig extends IProviderConfig = IProviderConfig,
> implements IProviderFactory<TProvider, TProviderConfig> {
  protected readonly providers: TProvider[];

  constructor(
    protected readonly providerRepository: IProviderRepository<ProviderDefinition<TProviderConfig>>,
    providers: TProvider[],
    /**
     * Explicit `Implementation` name -> "construct a fresh instance"
     * factory-function map, the "explicit over reflection" substitute for
     * C#'s DI-container `GetRequiredService(type)` + reflection-based
     * `GetImplementation()` type lookup.
     */
    protected readonly implementationFactories: Map<string, () => TProvider> = new Map(),
    protected readonly eventAggregator: ProviderFactoryEventAggregator = new NullProviderFactoryEventAggregator(),
    protected readonly logger: ProviderFactoryLogger = noopLogger
  ) {
    this.providers = [...providers];
  }

  all(): ProviderDefinition<TProviderConfig>[] {
    return this.providerRepository.all();
  }

  /**
   * Ported from ProviderFactory.GetDefaultDefinitions(): for each live
   * provider, use its own `DefaultDefinitions` entry matching (name ==
   * null or name == the provider's own type name), falling back to a fresh
   * definition built from the provider's `ConfigContract`/`Implementation`
   * name if none matches -- then stamps characteristics on it via
   * `SetProviderCharacteristics`.
   *
   * `provider.getType().Name` has no TS equivalent (no runtime class-name
   * reflection on an arbitrary `TProvider` value); this port uses
   * `provider.name` (the `IProvider.Name` display-name property already on
   * every provider instance) as the substitute -- the same field
   * `SetProviderCharacteristics` itself derives `definition.
   * implementationName` from below, so it's the closest faithful analog
   * available without reflection.
   */
  getDefaultDefinitions(): ProviderDefinition<TProviderConfig>[] {
    const result: ProviderDefinition<TProviderConfig>[] = [];

    for (const provider of this.providers) {
      let definition = provider.defaultDefinitions.find(
        (v) => v.name === null || v.name === "" || v.name === provider.name
      );

      if (!definition) {
        definition = createProviderDefinition<TProviderConfig>({
          name: "",
          configContract: provider.configContract,
          implementation: provider.name,
        });
      }

      this.setProviderCharacteristicsFor(provider, definition);

      result.push(definition);
    }

    return result;
  }

  /** Ported from ProviderFactory.GetPresetDefinitions(). */
  getPresetDefinitions(
    providerDefinition: ProviderDefinition<TProviderConfig>
  ): ProviderDefinition<TProviderConfig>[] {
    const provider = this.providers.find((v) => v.name === providerDefinition.implementation);
    if (!provider) {
      return [];
    }

    return provider.defaultDefinitions.filter(
      (v) => v.name !== null && v.name !== "" && v.name !== provider.name
    );
  }

  /** Ported from ProviderFactory.Test(TProviderDefinition definition): GetInstance(definition).Test(). */
  async test(definition: ProviderDefinition<TProviderConfig>): Promise<ValidationResult> {
    return this.getInstance(definition).test();
  }

  requestAction(
    definition: ProviderDefinition<TProviderConfig>,
    action: string,
    query: Record<string, string>
  ): unknown {
    return this.getInstance(definition).requestAction(action, query);
  }

  getAvailableProviders(): TProvider[] {
    return this.active().map((definition) => this.getInstance(definition));
  }

  exists(id: number): boolean {
    return this.providerRepository.find(id) !== undefined;
  }

  get(id: number): ProviderDefinition<TProviderConfig> {
    return this.providerRepository.get(id);
  }

  getMany(ids: number[]): ProviderDefinition<TProviderConfig>[] {
    return this.providerRepository.getMany(ids);
  }

  find(id: number): ProviderDefinition<TProviderConfig> | undefined {
    return this.providerRepository.find(id);
  }

  create(definition: ProviderDefinition<TProviderConfig>): ProviderDefinition<TProviderConfig> {
    const result = this.providerRepository.insert(definition);
    this.eventAggregator.publishEvent(new ProviderAddedEvent(result) as never);
    return result;
  }

  update(definition: ProviderDefinition<TProviderConfig>): void {
    this.providerRepository.update(definition);
    this.eventAggregator.publishEvent(new ProviderUpdatedEvent(definition) as never);
  }

  updateMany(
    definitions: ProviderDefinition<TProviderConfig>[]
  ): ProviderDefinition<TProviderConfig>[] {
    this.providerRepository.updateMany(definitions);

    for (const definition of definitions) {
      this.eventAggregator.publishEvent(new ProviderUpdatedEvent(definition) as never);
    }

    return definitions;
  }

  delete(id: number): void {
    this.providerRepository.delete(id);
    this.eventAggregator.publishEvent(new ProviderDeletedEvent(id));
  }

  deleteMany(ids: number[]): void {
    this.providerRepository.deleteMany(ids);

    for (const id of ids) {
      this.eventAggregator.publishEvent(new ProviderDeletedEvent(id));
    }
  }

  /**
   * Ported from ProviderFactory.GetInstance(): resolves the implementation
   * via the explicit factory-function map (see this class's doc comment),
   * attaches the definition, and stamps characteristics.
   */
  getInstance(definition: ProviderDefinition<TProviderConfig>): TProvider {
    const factory = this.implementationFactories.get(definition.implementation.toLowerCase());
    if (!factory) {
      throw new Error(`Unknown provider implementation "${definition.implementation}"`);
    }

    const instance = factory();
    instance.definition = definition;
    this.setProviderCharacteristicsFor(instance, definition);
    return instance;
  }

  /**
   * Ported from ProviderFactory.Handle(ApplicationStartedEvent): calls
   * RemoveMissingImplementations() then InitializeProviders() -- see this
   * class's doc comment re: no ApplicationStartedEvent bus yet, invoked
   * explicitly by a caller instead.
   */
  initialize(): void {
    this.logger.debug("Initializing Providers. Count %d", this.providers.length);

    this.removeMissingImplementations();
    this.initializeProviders();
  }

  /** Ported from ProviderFactory.InitializeProviders() -- empty hook in the base, overridable by subclasses. */
  protected initializeProviders(): void {
    // Intentionally empty, matching the C# base's `protected virtual void InitializeProviders() { }`.
  }

  /**
   * Ported from ProviderFactory.Active(): `All().Where(c =>
   * c.Settings.Validate().IsValid).ToList()`. See this class's doc comment
   * for why this does NOT also filter on `.Enable` -- that's a deliberate,
   * faithful preservation of the real C# base's behavior.
   */
  protected active(): ProviderDefinition<TProviderConfig>[] {
    return this.all().filter((c) => c.settings?.validate().isValid ?? false);
  }

  setProviderCharacteristics(definition: ProviderDefinition<TProviderConfig>): void {
    this.getInstance(definition);
  }

  /**
   * Ported from ProviderFactory.SetProviderCharacteristics(TProvider,
   * TProviderDefinition): `definition.ImplementationName = provider.Name;
   * definition.Message = provider.Message;`.
   */
  protected setProviderCharacteristicsFor(
    provider: TProvider,
    definition: ProviderDefinition<TProviderConfig>
  ): void {
    definition.implementationName = provider.name;
    definition.message = provider.message;
  }

  /**
   * Ported from ProviderFactory.RemoveMissingImplementations(): deletes any
   * stored definition whose `Implementation` no longer matches a
   * registered factory function (the explicit-registry substitute for
   * `GetImplementation(def) == null`, i.e. reflection finding no matching
   * live provider type).
   */
  protected removeMissingImplementations(): void {
    const stored = this.providerRepository.all();

    for (const invalidDefinition of stored) {
      if (!this.implementationFactories.has(invalidDefinition.implementation.toLowerCase())) {
        this.logger.warn("Removing %s", invalidDefinition.name);
        this.providerRepository.delete(invalidDefinition.id);
      }
    }
  }

  allForTag(tagId: number): ProviderDefinition<TProviderConfig>[] {
    return this.all().filter((p) => p.tags.includes(tagId));
  }
}
