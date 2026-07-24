import type { ValidationResult } from "../thingi-provider/IProviderConfig.js";
import {
  ProviderFactory,
  type ProviderFactoryEventAggregator,
  type ProviderFactoryLogger,
} from "../thingi-provider/ProviderFactory.js";
import type { IProviderRepository } from "../thingi-provider/IProviderRepository.js";
import type { IImportList } from "./IImportList.js";
import type { IImportListSettings } from "./IImportListSettings.js";
import {
  computeImportListDefinitionEnable,
  type ImportListDefinition,
} from "./ImportListDefinition.js";
import type { IImportListStatusService } from "./ImportListStatusService.js";

/**
 * Ported from NzbDrone.Core/ImportLists/ImportListFactory.cs.
 *
 * `ImportListFactory : ProviderFactory<IImportList, ImportListDefinition>`
 * -- extends the REAL `thingi-provider/ProviderFactory.ts` (per this
 * module's task brief), same pattern `notifications/NotificationFactory.ts`
 * established for the first real (non-forward-referenced) consumer of that
 * generic base.
 *
 * `Active()` override: `base.Active().Where(c => c.Enable).ToList()` --
 * same "ANDs with the base's own `Settings.Validate().IsValid` filter" note
 * as `NotificationFactory.ts`'s doc comment; `enable` is recomputed via
 * `computeImportListDefinitionEnable()` rather than trusted as a possibly-
 * stale stored field, for the identical reason
 * `computeNotificationDefinitionEnable` exists.
 *
 * `get()` is overridden below purely to narrow the base's
 * `ProviderDefinition<IImportListSettings>` return type to the real
 * `ImportListDefinition` shape every row in the `ImportLists` table
 * actually has at runtime (`ImportListRepository` only ever produces
 * `ImportListDefinition`-shaped values -- see that file's `rowToModel`).
 * `INotificationFactory` didn't need this narrowing because none of its own
 * callers read the extra ImportLists-only fields (`enableAutomaticAdd`,
 * `shouldMonitor`, etc.) off a definition returned from the factory the way
 * `ImportListSyncService`/`FetchAndParseImportListService` do here.
 */
export interface IImportListFactory {
  get(id: number): ImportListDefinition;
  getInstance(definition: ImportListDefinition): IImportList;
  getAvailableProviders(): IImportList[];
  automaticAddEnabled(filterBlockedImportLists?: boolean): IImportList[];
  test(definition: ImportListDefinition): Promise<ValidationResult>;
}

export class ImportListFactory
  extends ProviderFactory<IImportList, IImportListSettings>
  implements IImportListFactory
{
  constructor(
    private readonly importListStatusService: IImportListStatusService,
    providerRepository: IProviderRepository<ImportListDefinition>,
    providers: IImportList[],
    implementationFactories?: Map<string, () => IImportList>,
    eventAggregator?: ProviderFactoryEventAggregator,
    private readonly importListFactoryLogger?: ProviderFactoryLogger
  ) {
    super(
      providerRepository,
      providers,
      implementationFactories,
      eventAggregator,
      importListFactoryLogger
    );
  }

  /** Ported from `ImportListFactory.Active()`: `base.Active().Where(c => c.Enable).ToList()`. */
  protected override active(): ImportListDefinition[] {
    return (super.active() as ImportListDefinition[]).filter((c) =>
      computeImportListDefinitionEnable(c)
    );
  }

  /** Type-narrowing override -- see this class's doc comment. Behavior is identical to the inherited `ProviderFactory.get()`. */
  override get(id: number): ImportListDefinition {
    return super.get(id) as ImportListDefinition;
  }

  /**
   * Ported from `ImportListFactory.SetProviderCharacteristics()`: calls the
   * base (ImplementationName/Message) then stamps `ListType`/
   * `MinRefreshInterval` from the live provider instance onto the
   * definition -- matching `ImportListRepository.ts`'s doc comment on why
   * those two fields aren't persisted columns.
   */
  protected override setProviderCharacteristicsFor(
    provider: IImportList,
    definition: ImportListDefinition
  ): void {
    super.setProviderCharacteristicsFor(provider, definition);

    definition.listType = provider.listType;
    definition.minRefreshIntervalMs = provider.minRefreshIntervalMs;
  }

  /**
   * Ported from `ImportListFactory.AutomaticAddEnabled(bool
   * filterBlockedImportLists = true)`.
   */
  automaticAddEnabled(filterBlockedImportLists = true): IImportList[] {
    const enabled = this.getAvailableProviders().filter(
      (n) => (n.definition as ImportListDefinition).enableAutomaticAdd
    );

    return filterBlockedImportLists ? this.filterBlockedImportLists(enabled) : enabled;
  }

  /** Ported from `ImportListFactory.FilterBlockedImportLists()`. */
  private filterBlockedImportLists(importLists: IImportList[]): IImportList[] {
    const blocked = new Map(
      this.importListStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );

    const result: IImportList[] = [];
    for (const importList of importLists) {
      const blockedStatus = blocked.get(importList.definition.id);
      if (blockedStatus) {
        this.importListFactoryLogger?.debug(
          "Temporarily ignoring import list %s till %s due to recent failures.",
          importList.definition.name,
          blockedStatus.disabledTill
        );
        continue;
      }
      result.push(importList);
    }
    return result;
  }

  /**
   * Ported from `ImportListFactory.Test(ImportListDefinition definition)`:
   * runs the base `Test()` then records success/failure on the status
   * service, unless `definition.Id == 0` (a not-yet-saved definition being
   * tested from the add-import-list UI, matching the C# early-return).
   */
  override async test(definition: ImportListDefinition): Promise<ValidationResult> {
    const result = await super.test(definition);

    if (definition.id === 0) {
      return result;
    }

    if (result === null || result === undefined || result.isValid) {
      this.importListStatusService.recordSuccess(definition.id);
    } else {
      this.importListStatusService.recordFailure(definition.id);
    }

    return result;
  }
}
