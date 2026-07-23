import type { INamingConfigRepository } from "./namingConfigRepository.js";
import { newNamingConfigDefault, type NamingConfig } from "./namingConfig.js";

/**
 * Ported from NzbDrone.Core/Organizer/NamingConfigService.cs.
 *
 * C#'s `GetConfig()` double-checked-locking pattern (`lock (_repository)`)
 * exists to make first-run "insert the default row" safe under concurrent
 * requests. `node:sqlite` connections used by `BasicRepository` here are
 * synchronous (see db/basic-repository.ts) and this service has no
 * multi-threaded concurrency model to race against, so the lock itself
 * isn't ported -- the double-`singleOrDefault()` check is kept anyway,
 * preserving the exact same call sequence/behavior for a single-threaded
 * caller (a second `singleOrDefault()` after the first empty check remains
 * a correct, if now-redundant in a synchronous single-thread context,
 * mirror of the original).
 */
export interface INamingConfigService {
  getConfig(): NamingConfig;
  save(namingConfig: NamingConfig): void;
}

export class NamingConfigService implements INamingConfigService {
  constructor(private readonly repository: INamingConfigRepository) {}

  getConfig(): NamingConfig {
    let config = this.repository.singleOrDefault();

    if (config === undefined) {
      config = this.repository.singleOrDefault();

      if (config === undefined) {
        this.repository.insert(newNamingConfigDefault());
        config = this.repository.single();
      }
    }

    return config;
  }

  save(namingConfig: NamingConfig): void {
    this.repository.upsert(namingConfig);
  }
}
