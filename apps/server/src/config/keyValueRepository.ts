/**
 * INTEGRATION POINT (post-Datastore-merge):
 * ------------------------------------------------------------------------
 * This file defines the contract this module needs from the Datastore
 * module's `Config` table (see `NzbDrone.Core/Datastore/Migration/
 * 001_initial_setup.cs` in the reference source, which creates a `Config`
 * table with `Key` / `Value` string columns), WITHOUT depending on a
 * concrete Datastore implementation that doesn't exist in this worktree yet
 * (the Datastore module is being ported in parallel, on branch
 * `port/datastore`, in an isolated worktree this agent cannot see).
 *
 * `KeyValueRepository` is the narrow, obviously-named interface a real
 * `BasicRepository<Config>`-backed implementation (Readarr's
 * `ConfigRepository : BasicRepository<Config>, IConfigRepository`) should
 * satisfy. After the Datastore module merges, wiring this up should be a
 * small, mechanical change:
 *
 *   1. Implement `KeyValueRepository` on top of the real
 *      `BasicRepository<Config>` / `node:sqlite`-backed `Config` table
 *      (see `SqliteConfigRepository` below for the shape to follow --
 *      it's written against this same interface, just backed by an
 *      in-memory Map instead of SQLite, so it doubles as a template).
 *   2. Swap whatever constructs `ConfigService` today to pass in that real
 *      repository instead of an in-memory/fake one.
 *
 * Nothing in `ConfigService` (configService.ts) or `ConfigRepository`
 * (configRepository.ts) needs to change beyond that swap.
 * ------------------------------------------------------------------------
 */

/**
 * Mirrors the row shape of Readarr's `Config` model (Configuration/Config.cs):
 * a `ModelBase` (has an `Id`) plus `Key`/`Value` string columns. `Id` is
 * optional here since callers of `KeyValueRepository` mostly care about
 * key/value, not row identity -- identity is an implementation detail of
 * whatever's backing the interface (SQLite autoincrement, Map, etc).
 */
export interface ConfigRow {
  id?: number;
  key: string;
  value: string;
}

/**
 * The minimal key-value contract `ConfigService`/`ConfigRepository` need
 * from a persistence layer. Deliberately small and storage-agnostic so a
 * fake (in-memory) implementation can stand in for tests today, and the
 * real Datastore-backed implementation can drop in later without touching
 * any caller.
 *
 * Method names mirror Readarr's `IConfigRepository` (Get/Upsert) plus a
 * `getAll`/`get`/`set` naming Zay asked for explicitly, so both are covered:
 * `get`/`set`/`getAll` are the primary contract; `upsert` is kept as an
 * alias of `set` for readers coming from the C# side.
 */
export interface KeyValueRepository {
  /** Returns the raw string value for `key` (already-lowercased by the caller), or `undefined` if not set. */
  get(key: string): string | undefined;

  /** Inserts or updates the value for `key`. Mirrors `IConfigRepository.Upsert(key, value)`. */
  set(key: string, value: string): void;

  /** Alias of `set`, named to match the C# `ConfigRepository.Upsert`. */
  upsert(key: string, value: string): void;

  /** Returns every stored row. Mirrors `IBasicRepository<Config>.All()` as used by `ConfigService.EnsureCache`. */
  getAll(): ConfigRow[];

  /** True if `key` has a stored row. Mirrors `ConfigService.IsDefined` -> `_repository.Get(key) != null`. */
  has(key: string): boolean;
}

/**
 * In-memory `KeyValueRepository` for tests and for running the server before
 * Datastore lands. NOT for production use once the real SQLite-backed
 * repository exists -- values don't survive a process restart.
 *
 * Ported behavior-wise from `ConfigRepository : BasicRepository<Config>`:
 * `Get` is a case-sensitive lookup by key (`ConfigService` always lowercases
 * keys before calling in, matching the C# `key.ToLowerInvariant()` in
 * `ConfigService.GetValue`), and `Upsert` inserts if absent, else updates in place.
 */
export class InMemoryKeyValueRepository implements KeyValueRepository {
  private readonly store = new Map<string, string>();
  private nextId = 1;
  private readonly ids = new Map<string, number>();

  get(key: string): string | undefined {
    return this.store.get(key);
  }

  set(key: string, value: string): void {
    if (!this.ids.has(key)) {
      this.ids.set(key, this.nextId++);
    }

    this.store.set(key, value);
  }

  upsert(key: string, value: string): void {
    this.set(key, value);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  getAll(): ConfigRow[] {
    return Array.from(this.store.entries()).map(([key, value]) => ({
      id: this.ids.get(key),
      key,
      value,
    }));
  }
}
