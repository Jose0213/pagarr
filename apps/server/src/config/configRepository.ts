/**
 * Ported from NzbDrone.Core/Configuration/Config.cs and ConfigRepository.cs.
 *
 * C# `Config : ModelBase` has a `Key` (always lower-cased on set) and a
 * `Value`. `ConfigRepository : BasicRepository<Config>` adds `Get(key)`
 * (single-or-default lookup) and `Upsert(key, value)` (insert if absent,
 * else update).
 *
 * This module doesn't reimplement `BasicRepository<Config>` -- that's the
 * Datastore module's job (see keyValueRepository.ts's integration-point
 * comment). Instead, `ConfigRepository` here is a thin, faithful port of the
 * *behavior* Readarr's `ConfigRepository` class adds on top of the generic
 * repository, expressed against the `KeyValueRepository` interface so it
 * works today against the in-memory fake and later against the real
 * Datastore-backed implementation without changes.
 */

import type { KeyValueRepository } from "./keyValueRepository.js";

/** Ported from Configuration/Config.cs: the `Config` row model (`ModelBase` + Key/Value). */
export interface Config {
  id?: number;
  /** Always lower-invariant, matching the C# `Key` setter: `_key = value.ToLowerInvariant()`. */
  key: string;
  value: string;
}

export class ConfigRepository {
  constructor(private readonly kv: KeyValueRepository) {}

  /** Ported from `ConfigRepository.Get(string key)`: `Query(c => c.Key == key).SingleOrDefault()`. */
  get(key: string): Config | undefined {
    const lowerKey = key.toLowerCase();
    const value = this.kv.get(lowerKey);

    if (value === undefined) {
      return undefined;
    }

    return { key: lowerKey, value };
  }

  /**
   * Ported from `ConfigRepository.Upsert(string key, string value)`:
   * insert a new row if one doesn't exist for `key`, else update the
   * existing row's value in place.
   */
  upsert(key: string, value: string): Config {
    const lowerKey = key.toLowerCase();
    this.kv.upsert(lowerKey, value);
    return { key: lowerKey, value };
  }

  /** Ported from `IBasicRepository<Config>.All()` as used by `ConfigService.EnsureCache`. */
  all(): Config[] {
    return this.kv.getAll().map((row) => ({ id: row.id, key: row.key, value: row.value }));
  }
}
