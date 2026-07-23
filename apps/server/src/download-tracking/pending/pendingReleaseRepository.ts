import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import type { ParsedBookInfo } from "../../parser/model/parsedBookInfo.js";
import type { ReleaseInfo } from "../../parser/model/releaseInfo.js";
import { PendingReleaseReason } from "./pendingReleaseReason.js";
import type { PendingRelease } from "./pendingRelease.js";

type Row = {
  Id: number;
  Title: string;
  Added: string;
  Release: string;
  AuthorId: number;
  ParsedBookInfo: string;
  Reason: number;
};

/**
 * Ported from NzbDrone.Core/Download/Pending/PendingReleaseRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: the
 * `Release`/`ParsedBookInfo` columns are JSON-embedded documents (C#'s
 * `EmbeddedDocumentConverter<ReleaseInfo>` /
 * `EmbeddedDocumentConverter<ParsedBookInfo>`), same documented deviation
 * shape as `history/downloadHistoryRepository.ts` and
 * `indexers/IndexerStatusRepository.ts`. `additionalInfo`/`remoteBook`
 * (see pendingRelease.ts's doc comment on both) round-trip as `null` --
 * neither has a backing column, matching the real schema and the real C#
 * `TableMapping` registration.
 */
export interface IPendingReleaseRepository {
  all(): PendingRelease[];
  find(id: number): PendingRelease | undefined;
  get(id: number): PendingRelease;
  insert(model: PendingRelease): PendingRelease;
  update(model: PendingRelease): PendingRelease;
  delete(modelOrId: PendingRelease | number): void;
  deleteMany(modelsOrIds: PendingRelease[] | number[]): void;
  deleteByAuthorId(authorId: number): void;
  allByAuthorId(authorId: number): PendingRelease[];
  withoutFallback(): PendingRelease[];
}

export class PendingReleaseRepository implements IPendingReleaseRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): PendingRelease {
    return {
      id: row.Id,
      title: row.Title,
      added: row.Added,
      release: JSON.parse(row.Release) as ReleaseInfo,
      authorId: row.AuthorId,
      parsedBookInfo: JSON.parse(row.ParsedBookInfo) as ParsedBookInfo,
      reason: row.Reason,
      additionalInfo: null,
      remoteBook: null,
    };
  }

  all(): PendingRelease[] {
    const rows = this.conn().prepare('SELECT * FROM "PendingReleases"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): PendingRelease | undefined {
    const row = this.conn().prepare('SELECT * FROM "PendingReleases" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): PendingRelease {
    const model = this.find(id);
    if (!model) {
      throw new Error(`PendingRelease with ID ${id} does not exist`);
    }
    return model;
  }

  insert(model: PendingRelease): PendingRelease {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId", "ParsedBookInfo", "Reason") VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.title,
        model.added,
        JSON.stringify(model.release),
        model.authorId,
        JSON.stringify(model.parsedBookInfo),
        model.reason
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  update(model: PendingRelease): PendingRelease {
    if (model.id === 0) {
      throw new Error("Can't update model with ID 0");
    }

    this.conn()
      .prepare(
        'UPDATE "PendingReleases" SET "Title" = ?, "Added" = ?, "Release" = ?, "AuthorId" = ?, "ParsedBookInfo" = ?, "Reason" = ? WHERE "Id" = ?'
      )
      .run(
        model.title,
        model.added,
        JSON.stringify(model.release),
        model.authorId,
        JSON.stringify(model.parsedBookInfo),
        model.reason,
        model.id
      );

    return model;
  }

  delete(modelOrId: PendingRelease | number): void {
    const id = typeof modelOrId === "number" ? modelOrId : modelOrId.id;
    this.conn().prepare('DELETE FROM "PendingReleases" WHERE "Id" = ?').run(id);
  }

  deleteMany(modelsOrIds: PendingRelease[] | number[]): void {
    if (modelsOrIds.length === 0) {
      return;
    }
    const ids = modelsOrIds.map((m) => (typeof m === "number" ? m : m.id));
    const placeholders = ids.map(() => "?").join(", ");
    this.conn()
      .prepare(`DELETE FROM "PendingReleases" WHERE "Id" IN (${placeholders})`)
      .run(...ids);
  }

  /** Ported from `PendingReleaseRepository.DeleteByAuthorId`: `Delete(x => x.AuthorId == authorId)`. */
  deleteByAuthorId(authorId: number): void {
    this.conn().prepare('DELETE FROM "PendingReleases" WHERE "AuthorId" = ?').run(authorId);
  }

  /** Ported from `PendingReleaseRepository.AllByAuthorId`: `Query(p => p.AuthorId == authorId)`. */
  allByAuthorId(authorId: number): PendingRelease[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "PendingReleases" WHERE "AuthorId" = ?')
      .all(authorId) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  /** Ported from `PendingReleaseRepository.WithoutFallback`: `Query(p => p.Reason != PendingReleaseReason.Fallback)`. */
  withoutFallback(): PendingRelease[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "PendingReleases" WHERE "Reason" <> ?')
      .all(PendingReleaseReason.Fallback) as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }
}
