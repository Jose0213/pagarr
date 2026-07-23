import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { KavitaAuthenticationException } from "./KavitaException.js";
import type { IKavitaServiceProxy } from "./KavitaServiceProxy.js";
import type { KavitaSettings } from "./KavitaSettings.js";

/** Minimal logger surface KavitaService needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface KavitaServiceLogger {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Ported from NzbDrone.Core/Notifications/Kavita/KavitaService.cs. */
export interface IKavitaService {
  notify(settings: KavitaSettings, folderPath: string): Promise<void>;
  test(settings: KavitaSettings, message: string): Promise<ValidationFailure | null>;
}

export class KavitaService implements IKavitaService {
  constructor(
    private readonly proxy: IKavitaServiceProxy,
    private readonly logger: KavitaServiceLogger
  ) {}

  async notify(settings: KavitaSettings, folderPath: string): Promise<void> {
    await this.proxy.notify(settings, folderPath);
  }

  private async getToken(settings: KavitaSettings): Promise<string | null> {
    return this.proxy.getToken(settings);
  }

  async test(settings: KavitaSettings, _message: string): Promise<ValidationFailure | null> {
    try {
      this.logger.debug("Determining Authentication of Host: %s", this.proxy.getBaseUrl(settings));
      const token = await this.getToken(settings);
      this.logger.debug("Token is: %s", token);
    } catch (ex) {
      if (ex instanceof KavitaAuthenticationException) {
        this.logger.error("Unable to connect to Kavita Server", ex);
        return { propertyName: "ApiKey", errorMessage: "Incorrect ApiKey" };
      }

      this.logger.error("Unable to connect to Kavita Server", ex);
      return { propertyName: "Host", errorMessage: "Unable to connect to Kavita Server" };
    }

    return null;
  }
}
