import type { IDownloadClient } from "./IDownloadClient.js";
import type { DownloadClientDefinition } from "./DownloadClientDefinition.js";
import type { IDownloadClientStatusService } from "./DownloadClientStatusService.js";
import type { ValidationResult } from "../indexers/IIndexerSettings.js";

/** Minimal logger surface DownloadClientFactory needs. */
export interface DownloadClientFactoryLogger {
  debug(message: string, ...args: unknown[]): void;
}

const noopLogger: DownloadClientFactoryLogger = { debug: () => {} };

/**
 * Ported from NzbDrone.Core/Download/DownloadClientFactory.cs +
 * NzbDrone.Core/ThingiProvider/ProviderFactory.cs.
 *
 * FORWARD-REFERENCE NARROWING: same `ProviderFactory<TProvider,
 * TProviderDefinition>` situation `indexers/IndexerFactory.ts` documents --
 * this port takes an already-instantiated `IDownloadClient[]` rather than
 * porting the whole reflection-based DI-container provider-instantiation
 * base, and implements exactly the members `DownloadClientFactory`/
 * `IDownloadClientFactory` add on top: `Active()` filtering by `.Enable`,
 * `SetProviderCharacteristics` (re-populating `definition.protocol` from the
 * live instance, matching `IndexerRepository.ts`'s note that `Protocol`
 * isn't a persisted column), `DownloadHandlingEnabled` (filtered by blocked
 * status), and `Test()` (recording success/failure via
 * `IDownloadClientStatusService`).
 */
export interface IDownloadClientFactory {
  downloadHandlingEnabled(filterBlockedClients?: boolean): IDownloadClient[];
  setProviderCharacteristics(provider: IDownloadClient, definition: DownloadClientDefinition): void;
  test(definition: DownloadClientDefinition): Promise<ValidationResult>;
}

export class DownloadClientFactory implements IDownloadClientFactory {
  constructor(
    private readonly downloadClientStatusService: IDownloadClientStatusService,
    private readonly providers: IDownloadClient[],
    private readonly logger: DownloadClientFactoryLogger = noopLogger
  ) {}

  /** Ported from ProviderFactory.Active(): base filters definitions where `.Enable`. */
  private activeProviders(): IDownloadClient[] {
    return this.providers.filter((p) => p.definition.enable);
  }

  /**
   * Ported from `DownloadClientFactory.SetProviderCharacteristics()`: calls
   * the base (which sets Name/ImplementationName -- both UI-display-only and
   * out of scope here, see DownloadClientDefinition.ts) then stamps
   * `Protocol` from the live provider instance onto the definition.
   */
  setProviderCharacteristics(
    provider: IDownloadClient,
    definition: DownloadClientDefinition
  ): void {
    definition.protocol = provider.protocol;
  }

  private filterBlockedClients(clients: IDownloadClient[]): IDownloadClient[] {
    const blocked = new Map(
      this.downloadClientStatusService.getBlockedProviders().map((s) => [s.providerId, s])
    );

    const result: IDownloadClient[] = [];
    for (const client of clients) {
      const blockedStatus = blocked.get(client.definition.id);
      if (blockedStatus) {
        this.logger.debug(
          "Temporarily ignoring download client %s till %s due to recent failures.",
          client.definition.name,
          blockedStatus.disabledTill
        );
        continue;
      }
      result.push(client);
    }
    return result;
  }

  /** Ported from `DownloadClientFactory.DownloadHandlingEnabled(bool filterBlockedClients = true)`. */
  downloadHandlingEnabled(filterBlockedClients = true): IDownloadClient[] {
    const enabledClients = this.activeProviders();

    if (filterBlockedClients) {
      return this.filterBlockedClients(enabledClients);
    }

    return enabledClients;
  }

  /**
   * Ported from `DownloadClientFactory.Test(DownloadClientDefinition
   * definition)`: records success/failure on the status service after
   * running the matching live provider's own `.test()` (narrowed the same
   * way `IndexerFactory.test()` narrows `ProviderFactory.Test()` -- see that
   * file's doc comment).
   */
  async test(definition: DownloadClientDefinition): Promise<ValidationResult> {
    const client = this.providers.find((p) => p.definition.id === definition.id);
    const result = client ? await client.test() : { isValid: true, hasWarnings: false, errors: [] };

    if (definition.id === 0) {
      return result;
    }

    if (result.isValid) {
      this.downloadClientStatusService.recordSuccess(definition.id);
    } else {
      this.downloadClientStatusService.recordFailure(definition.id);
    }

    return result;
  }
}
