/**
 * Ported from NzbDrone.Core/Books/Repositories/AuthorMetadataRepository.cs.
 *
 * Backing table: AuthorMetadata (migrations 0001, 0009, 0013 -- see
 * db/migrations/0001_initial_setup.sql plus the SortName/NameLastFirst/
 * SortNameLastFirst columns added later).
 *
 * ## Deviation: JSON-embedded columns
 *
 * C#'s Dapper (via `TableMapping`'s JSON converters) transparently
 * serialized properties like `Aliases`/`Images`/`Links`/`Genres`/`Ratings`
 * to/from JSON text columns. Phase 0's `BasicRepository`/`ColumnMapping`
 * only special-cases `boolean` coercion (see basic-repository.ts's
 * `ColumnMapping.type` doc comment) -- it has no JSON-column concept, since
 * no Phase-0 table (Tags) needed one. Rather than extend the shared
 * `BasicRepository`/`ColumnMapping` contract for this one module (out of
 * scope for a Books-only port -- that's a Datastore-module change), this
 * repository overrides every read/write method to serialize the JSON
 * columns (`aliases`, `images`, `links`, `genres`, `ratings`) to/from
 * strings immediately at the `BasicRepository` boundary, so callers of
 * this class only ever see real arrays/objects, exactly like the C#
 * `AuthorMetadata` model.
 */

import type { IDatabase } from "../db/database.js";
import { BasicRepository, type ColumnMapping } from "../db/basic-repository.js";
import type { IEventAggregator } from "../db/events.js";
import type { AuthorMetadata } from "./models.js";

const AUTHOR_METADATA_COLUMNS: ColumnMapping<AuthorMetadata>[] = [
  { prop: "foreignAuthorId", column: "ForeignAuthorId" },
  { prop: "titleSlug", column: "TitleSlug" },
  { prop: "name", column: "Name" },
  { prop: "sortName", column: "SortName" },
  { prop: "nameLastFirst", column: "NameLastFirst" },
  { prop: "sortNameLastFirst", column: "SortNameLastFirst" },
  { prop: "aliases", column: "Aliases" },
  { prop: "overview", column: "Overview" },
  { prop: "disambiguation", column: "Disambiguation" },
  { prop: "gender", column: "Gender" },
  { prop: "hometown", column: "Hometown" },
  { prop: "born", column: "Born" },
  { prop: "died", column: "Died" },
  { prop: "status", column: "Status" },
  { prop: "images", column: "Images" },
  { prop: "links", column: "Links" },
  { prop: "genres", column: "Genres" },
  { prop: "ratings", column: "Ratings" },
];

/** Serializes the JSON-embedded fields to strings, ready for BasicRepository's toSqlValue-based binding. */
function serialize(model: AuthorMetadata): AuthorMetadata {
  return {
    ...model,
    aliases: JSON.stringify(model.aliases) as unknown as string[],
    images: JSON.stringify(model.images) as unknown as AuthorMetadata["images"],
    links: JSON.stringify(model.links) as unknown as AuthorMetadata["links"],
    genres: JSON.stringify(model.genres) as unknown as string[],
    ratings: JSON.stringify(model.ratings) as unknown as AuthorMetadata["ratings"],
  };
}

/** Deserializes the JSON-embedded fields back from the strings BasicRepository read off the row. */
function deserialize(model: AuthorMetadata): AuthorMetadata {
  return {
    ...model,
    aliases: parseOr(model.aliases as unknown as string, []),
    images: parseOr(model.images as unknown as string, []),
    links: parseOr(model.links as unknown as string, []),
    genres: parseOr(model.genres as unknown as string, []),
    ratings: parseOr(model.ratings as unknown as string, { votes: 0, value: 0 }),
  };
}

function parseOr<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value !== "string") {
    // Already deserialized (e.g. a caller-constructed in-memory model that
    // never round-tripped through the DB) -- pass through unchanged.
    return value;
  }
  return JSON.parse(value) as T;
}

export class AuthorMetadataRepository extends BasicRepository<AuthorMetadata> {
  constructor(database: IDatabase, eventAggregator?: IEventAggregator) {
    super(database, {
      tableName: "AuthorMetadata",
      columns: AUTHOR_METADATA_COLUMNS,
      eventAggregator,
    });
  }

  override all(): AuthorMetadata[] {
    return super.all().map(deserialize);
  }

  override find(id: number): AuthorMetadata | undefined {
    const model = super.find(id);
    return model ? deserialize(model) : undefined;
  }

  override get(id: number): AuthorMetadata {
    return deserialize(super.get(id));
  }

  override getMany(ids: number[]): AuthorMetadata[] {
    return super.getMany(ids).map(deserialize);
  }

  override single(): AuthorMetadata {
    return deserialize(super.single());
  }

  override singleOrDefault(): AuthorMetadata | undefined {
    const model = super.singleOrDefault();
    return model ? deserialize(model) : undefined;
  }

  override insert(model: AuthorMetadata): AuthorMetadata {
    return deserialize(super.insert(serialize(model)));
  }

  override insertMany(models: AuthorMetadata[]): AuthorMetadata[] {
    return super.insertMany(models.map(serialize)).map(deserialize);
  }

  override update(model: AuthorMetadata): AuthorMetadata {
    return deserialize(super.update(serialize(model)));
  }

  override updateMany(models: AuthorMetadata[]): void {
    super.updateMany(models.map(serialize));
  }

  override upsert(model: AuthorMetadata): AuthorMetadata {
    return deserialize(super.upsert(serialize(model)));
  }

  override setFields(
    model: AuthorMetadata,
    properties: Exclude<keyof AuthorMetadata, "id">[]
  ): void {
    super.setFields(serialize(model), properties);
  }

  /** Ported from AuthorMetadataRepository.FindById(List<string> foreignIds): `Query(x => foreignIds.Contains(x.ForeignAuthorId))`. */
  findById(foreignIds: string[]): AuthorMetadata[] {
    if (foreignIds.length === 0) {
      return [];
    }
    const all = this.all();
    const set = new Set(foreignIds);
    return all.filter((m) => set.has(m.foreignAuthorId));
  }

  /**
   * Ported from AuthorMetadataRepository.UpsertMany(List<AuthorMetadata> data):
   * for each incoming metadata record, find the existing row (by
   * ForeignAuthorId); if found, copy the existing DB id onto the incoming
   * record and update it only if it actually differs, else queue an
   * insert. Returns true if anything was updated or added, matching the
   * C# `updateMetadataList.Count > 0 || addMetadataList.Count > 0`.
   *
   * Deviation: C#'s `!meta.Equals(existing)` used the `Equ`
   * memberwise-equality comparer (see models.ts's module doc comment on
   * why `Entity<T>.Equals` isn't ported as a method). This uses a plain
   * JSON deep-equality check over the same field set instead -- same
   * semantics (are the two records identical field-for-field) without
   * porting a general-purpose memberwise comparer.
   */
  upsertMany(data: AuthorMetadata[]): boolean {
    const existingMetadata = this.findById(data.map((x) => x.foreignAuthorId));
    const updateMetadataList: AuthorMetadata[] = [];
    const addMetadataList: AuthorMetadata[] = [];

    for (const meta of data) {
      const existing = existingMetadata.find((x) => x.foreignAuthorId === meta.foreignAuthorId);

      if (existing) {
        const withId: AuthorMetadata = { ...meta, id: existing.id };

        if (!isEqual(withId, existing)) {
          updateMetadataList.push(withId);
        }
      } else {
        addMetadataList.push(meta);
      }
    }

    if (updateMetadataList.length > 0) {
      this.updateMany(updateMetadataList);
    }
    if (addMetadataList.length > 0) {
      this.insertMany(addMetadataList);
    }

    return updateMetadataList.length > 0 || addMetadataList.length > 0;
  }
}

function isEqual(a: AuthorMetadata, b: AuthorMetadata): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
