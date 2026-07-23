import type { CustomFormat } from "./customFormat.js";
import type { CustomFormatRepository } from "./customFormatRepository.js";
import {
  CustomFormatAddedEvent,
  CustomFormatDeletedEvent,
  NullCustomFormatEventAggregator,
  type ICustomFormatEventAggregator,
} from "./events.js";

/**
 * Ported from NzbDrone.Core/CustomFormats/CustomFormatService.cs.
 *
 * FORWARD-REFERENCE / DEVIATION -- `ICacheManager`/`ICached<T>`
 * (NzbDrone.Common.Cache) are not ported (no Common/Cache module exists yet
 * in this port -- everything under `apps/server/src` so far is Core-domain
 * modules, not the lower-level Common infra). The C# service uses
 * `_cache.Get("all", () => _formatRepository.All().ToDictionary(m =>
 * m.Id))` -- a get-or-populate cache keyed by a fixed "all" string, cleared
 * (`_cache.Clear()`) on every Insert/Update/Delete. That exact
 * get-or-populate + full-clear-on-write shape is reproduced here with a
 * plain `Map<number, CustomFormat> | undefined` field instead of an
 * `ICached<T>` instance -- same externally observable behavior (repeated
 * `all()`/`getById()` calls between writes hit the repository at most once),
 * just without the generic caching *infrastructure* C#'s CacheManager
 * provides (TTL/eviction policy, multi-consumer cache registry) since
 * nothing here needs those.
 */
export class CustomFormatService {
  private readonly eventAggregator: ICustomFormatEventAggregator;
  private cache: Map<number, CustomFormat> | undefined;

  constructor(
    private readonly formatRepository: CustomFormatRepository,
    eventAggregator?: ICustomFormatEventAggregator
  ) {
    this.eventAggregator = eventAggregator ?? new NullCustomFormatEventAggregator();
  }

  /** Ported from `CustomFormatService.AllDictionary()`. */
  private allDictionary(): Map<number, CustomFormat> {
    if (this.cache === undefined) {
      this.cache = new Map(this.formatRepository.all().map((f) => [f.id, f]));
    }
    return this.cache;
  }

  /** Ported from `CustomFormatService.All()`. */
  all(): CustomFormat[] {
    return [...this.allDictionary().values()];
  }

  /**
   * Ported from `CustomFormatService.GetById(int id)`: `AllDictionary()[id]`
   * -- C#'s dictionary indexer throws `KeyNotFoundException` for a missing
   * key, ported here as a plain `Error` with the same "does the key exist"
   * semantics (not `ModelNotFoundException`/`find`-style `undefined`, since
   * the C# source genuinely never guards this with a friendlier lookup).
   */
  getById(id: number): CustomFormat {
    const format = this.allDictionary().get(id);
    if (format === undefined) {
      throw new Error(`The given key '${id}' was not present in the dictionary.`);
    }
    return format;
  }

  /** Ported from `CustomFormatService.Update(CustomFormat customFormat)`. */
  update(customFormat: CustomFormat): void {
    this.formatRepository.update(customFormat);
    this.cache = undefined;
  }

  /**
   * Ported from `CustomFormatService.Insert(CustomFormat customFormat)`:
   * inserts, clears the cache, then publishes `CustomFormatAddedEvent` so
   * dependents (e.g. Profiles' `QualityProfileService.handleCustomFormatAdded`)
   * can sync -- "Add to DB then insert into profiles" per the C# comment.
   */
  insert(customFormat: CustomFormat): CustomFormat {
    const result = this.formatRepository.insert(customFormat);
    this.cache = undefined;

    this.eventAggregator.publishEvent(new CustomFormatAddedEvent(result));

    return result;
  }

  /**
   * Ported from `CustomFormatService.Delete(int id)`: publishes
   * `CustomFormatDeletedEvent` *before* the row is actually removed --
   * "Remove from profiles before removing from DB" per the C# comment --
   * then deletes and clears the cache.
   */
  delete(id: number): void {
    const format = this.formatRepository.get(id);

    this.eventAggregator.publishEvent(new CustomFormatDeletedEvent(format));

    this.formatRepository.delete(id);
    this.cache = undefined;
  }
}
