import type { IProviderConfig, ValidationResult } from "../thingi-provider/IProviderConfig.js";
import {
  ProviderFactory,
  type ProviderFactoryEventAggregator,
  type ProviderFactoryLogger,
} from "../thingi-provider/ProviderFactory.js";
import type { IProviderRepository } from "../thingi-provider/IProviderRepository.js";
import type { INotification } from "./INotification.js";
import {
  computeNotificationDefinitionEnable,
  type NotificationDefinition,
} from "./NotificationDefinition.js";
import type { INotificationStatusService } from "./NotificationStatusService.js";

/**
 * Ported from NzbDrone.Core/Notifications/NotificationFactory.cs.
 *
 * `NotificationFactory : ProviderFactory<INotification, NotificationDefinition>`
 * -- extends the REAL `thingi-provider/ProviderFactory.ts` (per this
 * module's task brief), the first provider-kind factory to do so for real
 * (Indexers/DownloadClients each hand-rolled their own narrower factory
 * before ThingiProvider existed -- see e.g.
 * `download-clients/DownloadClientFactory.ts`'s doc comment).
 *
 * `Active()` override: `base.Active().Where(c => c.Enable).ToList()`.
 * NOTE this is DIFFERENT from the base `ProviderFactory.Active()`'s own
 * filter (`Settings.Validate().IsValid` only, NOT `.Enable` -- see
 * `thingi-provider/ProviderFactory.ts`'s own doc comment on this exact
 * point). NotificationFactory's override effectively ANDs both conditions
 * together (base's validity filter, then this override's `.Enable` filter)
 * -- preserved faithfully, matching the real C# `protected override
 * List<NotificationDefinition> Active() { return
 * base.Active().Where(c => c.Enable).ToList(); }`. Since `enable` isn't a
 * settable/stored field on `NotificationDefinition` (see
 * `NotificationDefinition.ts`'s `computeNotificationDefinitionEnable` doc
 * comment -- it's a computed override of the base's virtual property in
 * C#), this override recomputes it via that helper rather than trusting a
 * possibly-stale `definition.enable` field.
 */
export interface INotificationFactory {
  onGrabEnabled(filterBlockedNotifications?: boolean): INotification[];
  onReleaseImportEnabled(filterBlockedNotifications?: boolean): INotification[];
  onUpgradeEnabled(filterBlockedNotifications?: boolean): INotification[];
  onRenameEnabled(filterBlockedNotifications?: boolean): INotification[];
  onHealthIssueEnabled(filterBlockedNotifications?: boolean): INotification[];
  onAuthorAddedEnabled(filterBlockedNotifications?: boolean): INotification[];
  onAuthorDeleteEnabled(filterBlockedNotifications?: boolean): INotification[];
  onBookDeleteEnabled(filterBlockedNotifications?: boolean): INotification[];
  onBookFileDeleteEnabled(filterBlockedNotifications?: boolean): INotification[];
  onBookFileDeleteForUpgradeEnabled(filterBlockedNotifications?: boolean): INotification[];
  onDownloadFailureEnabled(filterBlockedNotifications?: boolean): INotification[];
  onImportFailureEnabled(filterBlockedNotifications?: boolean): INotification[];
  onBookRetagEnabled(filterBlockedNotifications?: boolean): INotification[];
  onApplicationUpdateEnabled(filterBlockedNotifications?: boolean): INotification[];
  getAvailableProviders(): INotification[];
  test(definition: NotificationDefinition): Promise<ValidationResult>;
}

export class NotificationFactory
  extends ProviderFactory<INotification, IProviderConfig>
  implements INotificationFactory
{
  constructor(
    private readonly notificationStatusService: INotificationStatusService,
    providerRepository: IProviderRepository<NotificationDefinition>,
    providers: INotification[],
    implementationFactories?: Map<string, () => INotification>,
    eventAggregator?: ProviderFactoryEventAggregator,
    private readonly notificationFactoryLogger?: ProviderFactoryLogger
  ) {
    super(
      providerRepository,
      providers,
      implementationFactories,
      eventAggregator,
      notificationFactoryLogger
    );
  }

  /**
   * Ported from `NotificationFactory.Active()`: `base.Active().Where(c =>
   * c.Enable).ToList()`. See this class's doc comment for the faithful
   * "ANDs with the base's own validity filter" behavior and why `.enable`
   * is recomputed rather than read directly.
   */
  protected override active(): NotificationDefinition[] {
    return (super.active() as NotificationDefinition[]).filter((c) =>
      computeNotificationDefinitionEnable(c)
    );
  }

  private definitionOf(notification: INotification): NotificationDefinition {
    return notification.definition;
  }

  onGrabEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onGrab);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onReleaseImportEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onReleaseImport
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onUpgradeEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onUpgrade);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onRenameEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onRename);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onAuthorAddedEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onAuthorAdded);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onAuthorDeleteEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onAuthorDelete);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onBookDeleteEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onBookDelete);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onBookFileDeleteEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onBookFileDelete
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onBookFileDeleteForUpgradeEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onBookFileDeleteForUpgrade
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onHealthIssueEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onHealthIssue);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onDownloadFailureEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onDownloadFailure
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onImportFailureEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onImportFailure
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onBookRetagEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter((n) => this.definitionOf(n).onBookRetag);
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  onApplicationUpdateEnabled(filterBlockedNotifications = true): INotification[] {
    const matches = this.getAvailableProviders().filter(
      (n) => this.definitionOf(n).onApplicationUpdate
    );
    return filterBlockedNotifications ? this.filterBlockedNotifications(matches) : matches;
  }

  /**
   * Ported from `NotificationFactory.FilterBlockedNotifications()`: drops
   * any notification whose definition id is in the status service's
   * currently-blocked set, logging a debug line for each one dropped
   * (matching the C# `_logger.Debug(...)` call -- this port has no `Logger`
   * plumbed through the same way; `notificationFactoryLogger` (optional,
   * matching `ProviderFactoryLogger`'s narrowed `debug` surface) is used if
   * supplied).
   */
  private filterBlockedNotifications(notifications: INotification[]): INotification[] {
    const blocked = new Map(
      this.notificationStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );

    const result: INotification[] = [];
    for (const notification of notifications) {
      const blockedStatus = blocked.get(notification.definition.id);
      if (blockedStatus) {
        this.notificationFactoryLogger?.debug(
          "Temporarily ignoring notification %s till %s due to recent failures.",
          notification.definition.name,
          blockedStatus.disabledTill
        );
        continue;
      }
      result.push(notification);
    }
    return result;
  }

  /**
   * Ported from `NotificationFactory.SetProviderCharacteristics()`: calls
   * the base (ImplementationName/Message) then stamps every `SupportsOnX`
   * flag from the live provider instance onto the definition -- matching
   * `NotificationRepository.ts`'s doc comment on why those flags aren't
   * persisted columns (they're recomputed here, every time, from the live
   * instance's own getters, which in turn derive from
   * `NotificationBase.hasConcreteImplementation()`).
   */
  protected override setProviderCharacteristicsFor(
    provider: INotification,
    definition: NotificationDefinition
  ): void {
    super.setProviderCharacteristicsFor(provider, definition);

    definition.supportsOnGrab = provider.supportsOnGrab;
    definition.supportsOnReleaseImport = provider.supportsOnReleaseImport;
    definition.supportsOnUpgrade = provider.supportsOnUpgrade;
    definition.supportsOnRename = provider.supportsOnRename;
    definition.supportsOnAuthorAdded = provider.supportsOnAuthorAdded;
    definition.supportsOnAuthorDelete = provider.supportsOnAuthorDelete;
    definition.supportsOnBookDelete = provider.supportsOnBookDelete;
    definition.supportsOnBookFileDelete = provider.supportsOnBookFileDelete;
    definition.supportsOnBookFileDeleteForUpgrade = provider.supportsOnBookFileDeleteForUpgrade;
    definition.supportsOnHealthIssue = provider.supportsOnHealthIssue;
    definition.supportsOnDownloadFailure = provider.supportsOnDownloadFailure;
    definition.supportsOnImportFailure = provider.supportsOnImportFailure;
    definition.supportsOnBookRetag = provider.supportsOnBookRetag;
    definition.supportsOnApplicationUpdate = provider.supportsOnApplicationUpdate;
  }

  /**
   * Ported from `NotificationFactory.Test(NotificationDefinition
   * definition)`: runs the base `Test()` then records success/failure on
   * the status service, unless `definition.Id == 0` (a not-yet-saved
   * definition being tested from the add-notification UI, matching the C#
   * early-return).
   */
  override async test(definition: NotificationDefinition): Promise<ValidationResult> {
    const result = await super.test(definition);

    if (definition.id === 0) {
      return result;
    }

    if (result === null || result === undefined || result.isValid) {
      this.notificationStatusService.recordSuccess(definition.id);
    } else {
      this.notificationStatusService.recordFailure(definition.id);
    }

    return result;
  }
}
