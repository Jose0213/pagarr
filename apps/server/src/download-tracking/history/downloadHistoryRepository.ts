import type { DatabaseSync } from "node:sqlite";
import type { IDatabase } from "../../db/database.js";
import type { DownloadProtocol } from "../../indexers/DownloadProtocol.js";
import type { ReleaseInfo } from "../../parser/model/releaseInfo.js";
import { newDownloadHistory, type DownloadHistory } from "./downloadHistory.js";

type Row = {
  Id: number;
  EventType: number;
  AuthorId: number;
  DownloadId: string;
  SourceTitle: string;
  Date: string;
  Protocol: number | null;
  IndexerId: number | null;
  DownloadClientId: number | null;
  Release: string | null;
  Data: string | null;
};

/**
 * Ported from NzbDrone.Core/Download/History/DownloadHistoryRepository.cs.
 *
 * DEVIATION -- not built on the shared `BasicRepository<TModel>`: this
 * table's `Release`/`Data` columns are JSON-embedded documents (C#'s
 * `EmbeddedDocumentConverter<ReleaseInfo>` /
 * `EmbeddedDocumentConverter<Dictionary<string, string>>`), and
 * `BasicRepository`'s `ColumnMapping` only special-cases `boolean` columns
 * -- same documented deviation shape as `indexers/IndexerStatusRepository.ts`,
 * `root-folders/root-folder-repository.ts`, and
 * `profiles/qualities/qualityProfileRepository.ts`.
 */
export interface IDownloadHistoryRepository {
  all(): DownloadHistory[];
  find(id: number): DownloadHistory | undefined;
  get(id: number): DownloadHistory;
  insert(model: DownloadHistory): DownloadHistory;
  findByDownloadId(downloadId: string): DownloadHistory[];
  deleteByAuthorId(authorId: number): void;
}

export class DownloadHistoryRepository implements IDownloadHistoryRepository {
  constructor(private readonly database: IDatabase) {}

  private conn(): DatabaseSync {
    return this.database.openConnection();
  }

  private rowToModel(row: Row): DownloadHistory {
    return newDownloadHistory({
      id: row.Id,
      eventType: row.EventType,
      authorId: row.AuthorId,
      downloadId: row.DownloadId,
      sourceTitle: row.SourceTitle,
      date: row.Date,
      protocol: row.Protocol as DownloadProtocol | null,
      indexerId: row.IndexerId,
      downloadClientId: row.DownloadClientId,
      release: row.Release ? (JSON.parse(row.Release) as ReleaseInfo) : null,
      data: row.Data ? (JSON.parse(row.Data) as Record<string, string>) : {},
    });
  }

  all(): DownloadHistory[] {
    const rows = this.conn().prepare('SELECT * FROM "DownloadHistory"').all() as unknown as Row[];
    return rows.map((r) => this.rowToModel(r));
  }

  find(id: number): DownloadHistory | undefined {
    const row = this.conn().prepare('SELECT * FROM "DownloadHistory" WHERE "Id" = ?').get(id) as
      Row | undefined;
    return row ? this.rowToModel(row) : undefined;
  }

  get(id: number): DownloadHistory {
    const model = this.find(id);
    if (!model) {
      throw new Error(`DownloadHistory with ID ${id} does not exist`);
    }
    return model;
  }

  insert(model: DownloadHistory): DownloadHistory {
    if (model.id !== 0) {
      throw new Error(`Can't insert model with existing ID ${model.id}`);
    }

    const result = this.conn()
      .prepare(
        'INSERT INTO "DownloadHistory" ("EventType", "AuthorId", "DownloadId", "SourceTitle", "Date", "Protocol", "IndexerId", "DownloadClientId", "Release", "Data") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(
        model.eventType,
        model.authorId,
        model.downloadId,
        model.sourceTitle,
        model.date,
        model.protocol,
        model.indexerId,
        model.downloadClientId,
        model.release ? JSON.stringify(model.release) : null,
        JSON.stringify(model.data)
      );

    return { ...model, id: Number(result.lastInsertRowid) };
  }

  /** Ported from `DownloadHistoryRepository.FindByDownloadId`: `Query(h => h.DownloadId == downloadId).OrderByDescending(h => h.Date)`. */
  findByDownloadId(downloadId: string): DownloadHistory[] {
    const rows = this.conn()
      .prepare('SELECT * FROM "DownloadHistory" WHERE "DownloadId" = ?')
      .all(downloadId) as unknown as Row[];

    return rows.map((r) => this.rowToModel(r)).sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Ported from `DownloadHistoryRepository.DeleteByAuthorId`: `Delete(r => r.AuthorId == authorId)`. */
  deleteByAuthorId(authorId: number): void {
    this.conn().prepare('DELETE FROM "DownloadHistory" WHERE "AuthorId" = ?').run(authorId);
  }
}
