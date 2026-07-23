/**
 * Ported from NzbDrone.Core/Qualities/QualityDefinitionService.cs.
 *
 * C# `QualityDefinitionService` implements `IExecute<ResetQualityDefinitionsCommand>`
 * (Messaging module command dispatch) and `IHandle<ApplicationStartedEvent>`
 * (Messaging module event bus), neither of which are ported yet (Phase 4).
 * Ported here as plain methods (`execute`, `handleApplicationStarted`) that a
 * future Messaging-module dispatcher/bus can wire up without this class
 * changing -- same deviation pattern as ConfigService's `onConfigSaved`
 * callback (see configService.ts).
 *
 * C#'s `ICacheManager.GetCache<Dictionary<Quality, QualityDefinition>>
 * (GetType())` + `ICached.Get("all", factory, TimeSpan.FromSeconds(5.0))` is
 * ported as a plain in-memory cache with an explicit 5-second TTL and manual
 * `.clear()` calls at exactly the same call sites the C# source clears it
 * (`Update`, `UpdateMany`... wait, actually `UpdateMany` does NOT clear the
 * cache in the C# source -- see the deviation note on `updateMany` below),
 * matching this repo's established "replace ICacheManager/ICached with a
 * plain Map + explicit TTL" convention (see configFileProvider.ts's module
 * doc comment).
 *
 * No NLog Logger: the one log call (`_logger.Debug("Setting up default
 * quality config")`) is omitted, same as ConfigService -- Instrumentation
 * (Phase 4) isn't ported yet and nothing here needs logging to behave
 * correctly.
 */

import type { IQualityDefinitionRepository } from "./qualityDefinitionRepository.js";
import type { QualityDefinition } from "./qualityDefinition.js";
import { Quality } from "./quality.js";
import type { Quality as QualityType } from "./quality.js";
import type { ResetQualityDefinitionsCommand } from "./commands/resetQualityDefinitionsCommand.js";

export interface IQualityDefinitionService {
  update(qualityDefinition: QualityDefinition): void;
  updateMany(qualityDefinitions: QualityDefinition[]): void;
  all(): QualityDefinition[];
  getById(id: number): QualityDefinition;
  get(quality: QualityType): QualityDefinition;
}

const CACHE_TTL_MS = 5_000;

export class QualityDefinitionService implements IQualityDefinitionService {
  private readonly repo: IQualityDefinitionRepository;

  private cachedAt = 0;
  private cached: Map<number, QualityDefinition> | null = null;

  constructor(repo: IQualityDefinitionRepository) {
    this.repo = repo;
  }

  /**
   * Ported from `GetAll()`: `_cache.Get("all", () => ..., TimeSpan.
   * FromSeconds(5.0))`. Keyed by `Quality.id` here rather than the `Quality`
   * object itself (C#'s `Dictionary<Quality, QualityDefinition>` relies on
   * `Quality`'s `Equals`/`GetHashCode` overrides, which compare by `Id` --
   * so keying by the plain numeric id is behaviorally identical and avoids
   * needing a custom Map key-equality shim in TS).
   */
  private getAll(): Map<number, QualityDefinition> {
    const now = Date.now();

    if (this.cached !== null && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cached;
    }

    const all = this.repo.all().map((d) => withWeight(d));
    this.cached = new Map(all.map((d) => [d.quality.id, d]));
    this.cachedAt = now;

    return this.cached;
  }

  private clearCache(): void {
    this.cached = null;
  }

  /** Ported from `Update(QualityDefinition qualityDefinition)`. */
  update(qualityDefinition: QualityDefinition): void {
    this.repo.update(qualityDefinition);
    this.clearCache();
  }

  /**
   * Ported from `UpdateMany(List<QualityDefinition> qualityDefinitions)`.
   * DEVIATION FROM C# BEHAVIOR, faithfully preserved (not fixed): the real
   * `QualityDefinitionService.UpdateMany` calls `_repo.UpdateMany(...)` but
   * does NOT call `_cache.Clear()` afterwards (unlike `Update`, `Execute`,
   * and `InsertMissingDefinitions`, which all clear the cache). This reads
   * like an oversight in the original -- callers of `UpdateMany` alone would
   * see stale cached definitions for up to 5 seconds -- but per this port's
   * "preserve actual behavior, fix known bugs separately" rule, it is
   * reproduced here exactly rather than silently corrected.
   */
  updateMany(qualityDefinitions: QualityDefinition[]): void {
    this.repo.updateMany(qualityDefinitions);
  }

  /** Ported from `All()`: `GetAll().Values.OrderBy(d => d.Weight).ToList()`. */
  all(): QualityDefinition[] {
    return [...this.getAll().values()].sort((a, b) => a.weight - b.weight);
  }

  /**
   * Ported from `GetById(int id)`: `GetAll().Values.Single(v => v.Id ==
   * id)`. Throws if zero or more than one definition matches, matching
   * `Enumerable.Single`'s "no match" / "more than one match" exceptions.
   */
  getById(id: number): QualityDefinition {
    const matches = [...this.getAll().values()].filter((v) => v.id === id);

    if (matches.length === 0) {
      throw new Error("Sequence contains no matching element");
    }

    if (matches.length > 1) {
      throw new Error("Sequence contains more than one matching element");
    }

    return matches[0]!;
  }

  /** Ported from `Get(Quality quality)`: `GetAll()[quality]`. Throws if absent, matching a missing-dictionary-key KeyNotFoundException. */
  get(quality: QualityType): QualityDefinition {
    const found = this.getAll().get(quality.id);

    if (found === undefined) {
      throw new Error(`The given key '${quality.id}' was not present in the dictionary.`);
    }

    return found;
  }

  /**
   * Ported from `InsertMissingDefinitions()`: for every default definition
   * (in Weight order), insert it if the repo has no row for that Quality
   * yet, otherwise keep the existing row for an UpdateMany pass; any
   * existing rows for qualities no longer in the default set get deleted.
   */
  private insertMissingDefinitions(): void {
    const insertList: QualityDefinition[] = [];
    const updateList: QualityDefinition[] = [];

    const allDefinitions = [...Quality.DefaultQualityDefinitions].sort(
      (a, b) => a.weight - b.weight
    );
    const existingDefinitions = [...this.repo.all()];

    for (const definition of allDefinitions) {
      const existingIndex = existingDefinitions.findIndex(
        (d) => d.quality.id === definition.quality.id
      );

      if (existingIndex === -1) {
        insertList.push(definition);
      } else {
        updateList.push(existingDefinitions[existingIndex]!);
        existingDefinitions.splice(existingIndex, 1);
      }
    }

    this.repo.insertMany(insertList);
    this.repo.updateMany(updateList);
    this.repo.deleteMany(existingDefinitions);

    this.clearCache();
  }

  /**
   * Ported from `WithWeight(QualityDefinition definition)`: fills in the
   * (non-persisted, see qualityDefinition.ts) Weight field from
   * `Quality.DefaultQualityDefinitions` on every read. Throws if a stored
   * quality has no matching default definition, matching `.Single(...)`.
   */

  /** Ported from `Handle(ApplicationStartedEvent message)`. See module doc comment on the Messaging-module deviation. */
  handleApplicationStarted(): void {
    this.insertMissingDefinitions();
  }

  /**
   * Ported from `Execute(ResetQualityDefinitionsCommand message)`. Resets
   * every default definition's MinSize/MaxSize unconditionally, and Title
   * only when `message.ResetTitles` is true (else keeps the existing
   * title) -- matching `existing.Title = message.ResetTitles ?
   * definition.Title : existing.Title;` exactly, including that this throws
   * if a default-set quality has no existing row yet (C#'s
   * `SingleOrDefault` there is assigned into `existing` and then
   * dereferenced without a null check -- a real NullReferenceException risk
   * in the original if `InsertMissingDefinitions` hasn't run first; ported
   * as-is per the "preserve actual behavior" rule).
   */
  execute(command: ResetQualityDefinitionsCommand): void {
    const updateList: QualityDefinition[] = [];

    const allDefinitions = [...Quality.DefaultQualityDefinitions].sort(
      (a, b) => a.weight - b.weight
    );
    const existingDefinitions = [...this.repo.all()];

    for (const definition of allDefinitions) {
      const existing = existingDefinitions.find((d) => d.quality.id === definition.quality.id);

      if (existing === undefined) {
        throw new Error("Sequence contains no matching element");
      }

      existing.minSize = definition.minSize;
      existing.maxSize = definition.maxSize;
      existing.title = command.resetTitles ? definition.title : existing.title;

      updateList.push(existing);
    }

    this.repo.updateMany(updateList);

    this.clearCache();
  }
}

/** Ported from the private static `WithWeight(QualityDefinition definition)` helper. */
function withWeight(definition: QualityDefinition): QualityDefinition {
  const match = Quality.DefaultQualityDefinitions.find(
    (d) => d.quality.id === definition.quality.id
  );

  if (match === undefined) {
    throw new Error("Sequence contains no matching element");
  }

  return { ...definition, weight: match.weight };
}
