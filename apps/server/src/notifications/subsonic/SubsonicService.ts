import type { ValidationFailure } from "../../thingi-provider/IProviderConfig.js";
import { SubsonicAuthenticationException } from "./SubsonicException.js";
import type { ISubsonicServerProxy } from "./SubsonicServerProxy.js";
import type { SubsonicSettings } from "./SubsonicSettings.js";

/** Minimal logger surface SubsonicService needs, matching this port's per-module logger convention (see e.g. `indexers/indexerBase.ts`'s `IndexerLogger`). */
export interface SubsonicServiceLogger {
  debug(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/** Ported from NzbDrone.Core/Notifications/Subsonic/SubsonicService.cs. */
export interface ISubsonicService {
  notify(settings: SubsonicSettings, message: string): Promise<void>;
  update(settings: SubsonicSettings): Promise<void>;
  test(settings: SubsonicSettings, message: string): Promise<ValidationFailure | null>;
}

export class SubsonicService implements ISubsonicService {
  constructor(
    private readonly proxy: ISubsonicServerProxy,
    private readonly logger: SubsonicServiceLogger
  ) {}

  async notify(settings: SubsonicSettings, message: string): Promise<void> {
    await this.proxy.notify(settings, message);
  }

  async update(settings: SubsonicSettings): Promise<void> {
    await this.proxy.update(settings);
  }

  private async getVersion(settings: SubsonicSettings): Promise<string> {
    return this.proxy.version(settings);
  }

  async test(settings: SubsonicSettings, _message: string): Promise<ValidationFailure | null> {
    try {
      this.logger.debug("Determining version of Host: %s", this.proxy.getBaseUrl(settings));
      const version = await this.getVersion(settings);
      this.logger.debug("Version is: %s", version);
    } catch (ex) {
      if (ex instanceof SubsonicAuthenticationException) {
        this.logger.error("Unable to connect to Subsonic Server", ex);
        return { propertyName: "Username", errorMessage: "Incorrect username or password" };
      }

      this.logger.error("Unable to connect to Subsonic Server", ex);
      return { propertyName: "Host", errorMessage: "Unable to connect to Subsonic Server" };
    }

    return null;
  }
}
