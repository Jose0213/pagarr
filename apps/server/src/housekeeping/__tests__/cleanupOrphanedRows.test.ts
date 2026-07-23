import { describe, expect, it, afterEach, beforeEach } from "vitest";
import { createTestDatabase } from "./testDb.js";
import type { MainDatabase } from "../../db/db-factory.js";
import { CleanupAbsolutePathMetadataFiles } from "../housekeepers/cleanupAbsolutePathMetadataFiles.js";
import { CleanupAdditionalNamingSpecs } from "../housekeepers/cleanupAdditionalNamingSpecs.js";
import { CleanupAdditionalUsers } from "../housekeepers/cleanupAdditionalUsers.js";
import { CleanupDownloadClientUnavailablePendingReleases } from "../housekeepers/cleanupDownloadClientUnavailablePendingReleases.js";
import { CleanupDuplicateMetadataFiles } from "../housekeepers/cleanupDuplicateMetadataFiles.js";
import { CleanupOrphanedAuthorMetadata } from "../housekeepers/cleanupOrphanedAuthorMetadata.js";
import { CleanupOrphanedBlocklist } from "../housekeepers/cleanupOrphanedBlocklist.js";
import { CleanupOrphanedBookFiles } from "../housekeepers/cleanupOrphanedBookFiles.js";
import { CleanupOrphanedBooks } from "../housekeepers/cleanupOrphanedBooks.js";
import { CleanupOrphanedDownloadClientStatus } from "../housekeepers/cleanupOrphanedDownloadClientStatus.js";
import { CleanupOrphanedEditions } from "../housekeepers/cleanupOrphanedEditions.js";
import { CleanupOrphanedHistoryItems } from "../housekeepers/cleanupOrphanedHistoryItems.js";
import { CleanupOrphanedImportListStatus } from "../housekeepers/cleanupOrphanedImportListStatus.js";
import { CleanupOrphanedIndexerStatus } from "../housekeepers/cleanupOrphanedIndexerStatus.js";
import { CleanupOrphanedMetadataFiles } from "../housekeepers/cleanupOrphanedMetadataFiles.js";
import { CleanupOrphanedNotificationStatus } from "../housekeepers/cleanupOrphanedNotificationStatus.js";
import { CleanupOrphanedPendingReleases } from "../housekeepers/cleanupOrphanedPendingReleases.js";
import { CleanupOrphanedSeriesBookLinks } from "../housekeepers/cleanupOrphanedSeriesBookLinks.js";
import { CleanupUnusedTags } from "../housekeepers/cleanupUnusedTags.js";
import { FixMultipleMonitoredEditions } from "../housekeepers/fixMultipleMonitoredEditions.js";

describe("Housekeeping raw-SQL cleanup tasks", () => {
  let db: MainDatabase;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  function exec(sql: string, params: unknown[] = []): void {
    db.openConnection()
      .prepare(sql)
      .run(...(params as never[]));
  }

  function insertAuthorMetadata(foreignAuthorId: string, name = "Author"): number {
    exec(
      `INSERT INTO "AuthorMetadata" ("ForeignAuthorId", "TitleSlug", "Name", "Status", "Images", "SortName", "NameLastFirst", "SortNameLastFirst") VALUES (?, ?, ?, 0, '[]', ?, ?, ?)`,
      [
        foreignAuthorId,
        `${foreignAuthorId}-slug`,
        name,
        name.toLowerCase(),
        name,
        name.toLowerCase(),
      ]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertAuthor(authorMetadataId: number, cleanName = "author"): number {
    exec(
      `INSERT INTO "Authors" ("CleanName", "Path", "Monitored", "AuthorMetadataId") VALUES (?, ?, 1, ?)`,
      [cleanName, `/books/${cleanName}`, authorMetadataId]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertBook(authorMetadataId: number, foreignBookId: string): number {
    exec(
      `INSERT INTO "Books" ("AuthorMetadataId", "ForeignBookId", "TitleSlug", "Title", "CleanTitle", "Monitored", "AnyEditionOk") VALUES (?, ?, ?, ?, ?, 1, 1)`,
      [authorMetadataId, foreignBookId, `${foreignBookId}-slug`, foreignBookId, foreignBookId]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertEdition(bookId: number, foreignEditionId: string, monitored = 1): number {
    exec(
      `INSERT INTO "Editions" ("BookId", "ForeignEditionId", "Title", "TitleSlug", "Images", "Monitored", "ManualAdd") VALUES (?, ?, ?, ?, '[]', ?, 0)`,
      [bookId, foreignEditionId, foreignEditionId, `${foreignEditionId}-slug`, monitored]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertBookFile(editionId: number, path: string): number {
    exec(
      `INSERT INTO "BookFiles" ("EditionId", "CalibreId", "Quality", "Size", "DateAdded", "Path") VALUES (?, 0, '{}', 0, '2024-01-01', ?)`,
      [editionId, path]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertSeries(foreignSeriesId: string): number {
    exec(
      `INSERT INTO "Series" ("ForeignSeriesId", "Title", "Numbered", "WorkCount", "PrimaryWorkCount") VALUES (?, ?, 0, 0, 0)`,
      [foreignSeriesId, foreignSeriesId]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function insertMetadataFile(
    authorId: number,
    overrides: Partial<{
      bookId: number;
      bookFileId: number;
      type: number;
      relativePath: string;
    }> = {}
  ): number {
    exec(
      `INSERT INTO "MetadataFiles" ("AuthorId", "Consumer", "Type", "RelativePath", "LastUpdated", "BookId", "BookFileId", "Extension") VALUES (?, 'Test', ?, ?, '2024-01-01', ?, ?, '.jpg')`,
      [
        authorId,
        overrides.type ?? 1,
        overrides.relativePath ?? "cover.jpg",
        overrides.bookId ?? 0,
        overrides.bookFileId ?? 0,
      ]
    );
    return Number(db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id);
  }

  function countRows(table: string): number {
    return Number(db.openConnection().prepare(`SELECT COUNT(*) as c FROM "${table}"`).get()!.c);
  }

  it("CleanupAbsolutePathMetadataFiles: deletes rows with drive-letter/backslash/forward-slash RelativePath, keeps relative ones", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);
    insertMetadataFile(authorId, { relativePath: "C:\\evil\\cover.jpg" });
    insertMetadataFile(authorId, { relativePath: "\\evil\\cover.jpg" });
    insertMetadataFile(authorId, { relativePath: "/evil/cover.jpg" });
    insertMetadataFile(authorId, { relativePath: "cover.jpg" });

    new CleanupAbsolutePathMetadataFiles(db).clean();

    const remaining = db
      .openConnection()
      .prepare('SELECT "RelativePath" FROM "MetadataFiles"')
      .all() as { RelativePath: string }[];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.RelativePath).toBe("cover.jpg");
  });

  it("CleanupAdditionalNamingSpecs: keeps only one NamingConfig row", () => {
    exec(`INSERT INTO "NamingConfig" DEFAULT VALUES`);
    exec(`INSERT INTO "NamingConfig" DEFAULT VALUES`);
    exec(`INSERT INTO "NamingConfig" DEFAULT VALUES`);
    expect(countRows("NamingConfig")).toBe(3);

    new CleanupAdditionalNamingSpecs(db).clean();

    expect(countRows("NamingConfig")).toBe(1);
  });

  it("CleanupAdditionalUsers: keeps only one Users row", () => {
    exec(
      `INSERT INTO "Users" ("Identifier", "Username", "Password") VALUES ('id-1', 'user1', 'hash1')`
    );
    exec(
      `INSERT INTO "Users" ("Identifier", "Username", "Password") VALUES ('id-2', 'user2', 'hash2')`
    );
    expect(countRows("Users")).toBe(2);

    new CleanupAdditionalUsers(db).clean();

    expect(countRows("Users")).toBe(1);
  });

  it("CleanupDownloadClientUnavailablePendingReleases: deletes old DownloadClientUnavailable/Fallback rows, keeps recent and other reasons", () => {
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const recentDate = new Date().toISOString();

    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId", "Reason") VALUES ('old-unavailable', ?, '{}', 1, 1)`,
      [oldDate]
    );
    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId", "Reason") VALUES ('old-fallback', ?, '{}', 1, 2)`,
      [oldDate]
    );
    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId", "Reason") VALUES ('old-delay', ?, '{}', 1, 0)`,
      [oldDate]
    );
    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId", "Reason") VALUES ('recent-unavailable', ?, '{}', 1, 1)`,
      [recentDate]
    );

    new CleanupDownloadClientUnavailablePendingReleases(db).clean();

    const remaining = db
      .openConnection()
      .prepare('SELECT "Title" FROM "PendingReleases" ORDER BY "Title"')
      .all() as { Title: string }[];
    expect(remaining.map((r) => r.Title)).toEqual(["old-delay", "recent-unavailable"]);
  });

  it("CleanupDuplicateMetadataFiles: keeps the newest (MAX id) of each duplicate group, drops the rest", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);
    const bookId = insertBook(authorMetaId, "book-1");

    // Author metadata duplicates (Type 1)
    insertMetadataFile(authorId, { type: 1 });
    insertMetadataFile(authorId, { type: 1 });

    // Book metadata duplicates (Type 2)
    insertMetadataFile(authorId, { type: 2, bookId });
    insertMetadataFile(authorId, { type: 2, bookId });

    new CleanupDuplicateMetadataFiles(db).clean();

    const remaining = db
      .openConnection()
      .prepare('SELECT "Id", "Type" FROM "MetadataFiles" ORDER BY "Type"')
      .all() as { Id: number; Type: number }[];

    expect(remaining).toHaveLength(2);
    // MIN(Id) was deleted from each group -- the surviving row in each group is the higher id.
    expect(remaining[0]!.Id).toBeGreaterThan(1);
    expect(remaining[1]!.Id).toBeGreaterThan(1);
  });

  it("CleanupOrphanedAuthorMetadata: deletes AuthorMetadata referenced by neither Books nor Authors", () => {
    const orphanId = insertAuthorMetadata("fa-orphan");
    const usedByAuthorId = insertAuthorMetadata("fa-author");
    insertAuthor(usedByAuthorId);
    const usedByBookId = insertAuthorMetadata("fa-book");
    insertBook(usedByBookId, "book-1");

    new CleanupOrphanedAuthorMetadata(db).clean();

    const remainingIds = db
      .openConnection()
      .prepare('SELECT "Id" FROM "AuthorMetadata"')
      .all()
      .map((r) => (r as { Id: number }).Id);

    expect(remainingIds).not.toContain(orphanId);
    expect(remainingIds).toContain(usedByAuthorId);
    expect(remainingIds).toContain(usedByBookId);
  });

  it("CleanupOrphanedBlocklist: deletes Blocklist rows whose AuthorId no longer exists", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);
    exec(
      `INSERT INTO "Blocklist" ("SourceTitle", "Quality", "Date", "AuthorId") VALUES ('t1', '{}', '2024-01-01', ?)`,
      [authorId]
    );
    exec(
      `INSERT INTO "Blocklist" ("SourceTitle", "Quality", "Date", "AuthorId") VALUES ('t2', '{}', '2024-01-01', 9999)`
    );

    new CleanupOrphanedBlocklist(db).clean();

    const remaining = db
      .openConnection()
      .prepare('SELECT "SourceTitle" FROM "Blocklist"')
      .all() as { SourceTitle: string }[];
    expect(remaining).toEqual([{ SourceTitle: "t1" }]);
  });

  it("CleanupOrphanedBookFiles: unlinks (EditionId=0) BookFiles whose Edition no longer exists, doesn't delete the row", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const bookId = insertBook(authorMetaId, "book-1");
    const editionId = insertEdition(bookId, "ed-1");
    const validFileId = insertBookFile(editionId, "/books/valid.epub");
    const orphanFileId = insertBookFile(999999, "/books/orphan.epub");

    new CleanupOrphanedBookFiles(db).clean();

    expect(countRows("BookFiles")).toBe(2);
    const validRow = db
      .openConnection()
      .prepare('SELECT "EditionId" FROM "BookFiles" WHERE "Id" = ?')
      .get(validFileId) as { EditionId: number };
    const orphanRow = db
      .openConnection()
      .prepare('SELECT "EditionId" FROM "BookFiles" WHERE "Id" = ?')
      .get(orphanFileId) as { EditionId: number };
    expect(validRow.EditionId).toBe(editionId);
    expect(orphanRow.EditionId).toBe(0);
  });

  it("CleanupOrphanedBooks: deletes Books whose AuthorMetadataId has no matching Authors.AuthorMetadataId", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    insertAuthor(authorMetaId);
    insertBook(authorMetaId, "book-kept");
    insertBook(999999, "book-orphan");

    new CleanupOrphanedBooks(db).clean();

    const titles = db.openConnection().prepare('SELECT "Title" FROM "Books"').all() as {
      Title: string;
    }[];
    expect(titles).toEqual([{ Title: "book-kept" }]);
  });

  it("CleanupOrphanedDownloadClientStatus: deletes status rows whose ProviderId no longer matches a DownloadClients row", () => {
    exec(
      `INSERT INTO "DownloadClients" ("Enable", "Name", "Implementation", "Settings", "ConfigContract") VALUES (1, 'qbit', 'QBittorrent', '{}', 'QBittorrentSettings')`
    );
    const clientId = Number(
      db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id
    );

    exec(`INSERT INTO "DownloadClientStatus" ("ProviderId", "EscalationLevel") VALUES (?, 0)`, [
      clientId,
    ]);
    exec(`INSERT INTO "DownloadClientStatus" ("ProviderId", "EscalationLevel") VALUES (9999, 0)`);

    new CleanupOrphanedDownloadClientStatus(db).clean();

    expect(countRows("DownloadClientStatus")).toBe(1);
  });

  it("CleanupOrphanedEditions: deletes Editions whose BookId no longer matches a Books row", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const bookId = insertBook(authorMetaId, "book-1");
    insertEdition(bookId, "ed-kept");
    insertEdition(999999, "ed-orphan");

    new CleanupOrphanedEditions(db).clean();

    const titles = db.openConnection().prepare('SELECT "Title" FROM "Editions"').all() as {
      Title: string;
    }[];
    expect(titles).toEqual([{ Title: "ed-kept" }]);
  });

  it("CleanupOrphanedHistoryItems: deletes rows orphaned by author OR by book", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);
    const bookId = insertBook(authorMetaId, "book-1");

    exec(
      `INSERT INTO "History" ("SourceTitle", "Date", "Quality", "Data", "AuthorId", "BookId") VALUES ('kept', '2024-01-01', '{}', '{}', ?, ?)`,
      [authorId, bookId]
    );
    exec(
      `INSERT INTO "History" ("SourceTitle", "Date", "Quality", "Data", "AuthorId", "BookId") VALUES ('orphan-author', '2024-01-01', '{}', '{}', 9999, ?)`,
      [bookId]
    );
    exec(
      `INSERT INTO "History" ("SourceTitle", "Date", "Quality", "Data", "AuthorId", "BookId") VALUES ('orphan-book', '2024-01-01', '{}', '{}', ?, 9999)`,
      [authorId]
    );

    new CleanupOrphanedHistoryItems(db).clean();

    const titles = db.openConnection().prepare('SELECT "SourceTitle" FROM "History"').all() as {
      SourceTitle: string;
    }[];
    expect(titles).toEqual([{ SourceTitle: "kept" }]);
  });

  it("CleanupOrphanedImportListStatus: deletes status rows whose ProviderId no longer matches an ImportLists row", () => {
    exec(
      `INSERT INTO "ImportLists" ("Name", "Implementation", "RootFolderPath", "ShouldMonitor", "ProfileId", "MetadataProfileId") VALUES ('GR', 'Goodreads', '/books', 1, 1, 1)`
    );
    const listId = Number(
      db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id
    );

    exec(`INSERT INTO "ImportListStatus" ("ProviderId", "EscalationLevel") VALUES (?, 0)`, [
      listId,
    ]);
    exec(`INSERT INTO "ImportListStatus" ("ProviderId", "EscalationLevel") VALUES (9999, 0)`);

    new CleanupOrphanedImportListStatus(db).clean();

    expect(countRows("ImportListStatus")).toBe(1);
  });

  it("CleanupOrphanedIndexerStatus: deletes status rows whose ProviderId no longer matches an Indexers row", () => {
    exec(
      `INSERT INTO "Indexers" ("Name", "Implementation", "EnableInteractiveSearch") VALUES ('idx', 'Newznab', 1)`
    );
    const indexerId = Number(
      db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id
    );

    exec(`INSERT INTO "IndexerStatus" ("ProviderId", "EscalationLevel") VALUES (?, 0)`, [
      indexerId,
    ]);
    exec(`INSERT INTO "IndexerStatus" ("ProviderId", "EscalationLevel") VALUES (9999, 0)`);

    new CleanupOrphanedIndexerStatus(db).clean();

    expect(countRows("IndexerStatus")).toBe(1);
  });

  it("CleanupOrphanedMetadataFiles: five passes -- orphaned by author, by book, by bookfile, and zero-id book/bookfile Type 2/4 rows", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);
    const bookId = insertBook(authorMetaId, "book-1");
    const editionId = insertEdition(bookId, "ed-1");
    const bookFileId = insertBookFile(editionId, "/books/valid.epub");

    const keptId = insertMetadataFile(authorId, {
      type: 2,
      bookId,
      bookFileId,
      relativePath: "kept.jpg",
    });
    const orphanedByAuthorId = insertMetadataFile(9999, { relativePath: "by-author.jpg" });
    const orphanedByBookId = insertMetadataFile(authorId, {
      type: 2,
      bookId: 9999,
      relativePath: "by-book.jpg",
    });
    const orphanedByTrackFileId = insertMetadataFile(authorId, {
      type: 2,
      bookFileId: 9999,
      relativePath: "by-trackfile.jpg",
    });
    const zeroBookId = insertMetadataFile(authorId, {
      type: 2,
      bookId: 0,
      relativePath: "zero-book.jpg",
    });
    const zeroTrackFileId = insertMetadataFile(authorId, {
      type: 4,
      bookFileId: 0,
      relativePath: "zero-trackfile.jpg",
    });

    new CleanupOrphanedMetadataFiles(db).clean();

    const remainingIds = db
      .openConnection()
      .prepare('SELECT "Id" FROM "MetadataFiles"')
      .all()
      .map((r) => (r as { Id: number }).Id);

    expect(remainingIds).toEqual([keptId]);
    expect(remainingIds).not.toContain(orphanedByAuthorId);
    expect(remainingIds).not.toContain(orphanedByBookId);
    expect(remainingIds).not.toContain(orphanedByTrackFileId);
    expect(remainingIds).not.toContain(zeroBookId);
    expect(remainingIds).not.toContain(zeroTrackFileId);
  });

  it("CleanupOrphanedNotificationStatus: deletes status rows whose ProviderId no longer matches a Notifications row", () => {
    exec(
      `INSERT INTO "Notifications" ("Name", "OnGrab", "Settings", "Implementation", "OnRename") VALUES ('disc', 1, '{}', 'Discord', 0)`
    );
    const notifId = Number(
      db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id
    );

    exec(`INSERT INTO "NotificationStatus" ("ProviderId", "EscalationLevel") VALUES (?, 0)`, [
      notifId,
    ]);
    exec(`INSERT INTO "NotificationStatus" ("ProviderId", "EscalationLevel") VALUES (9999, 0)`);

    new CleanupOrphanedNotificationStatus(db).clean();

    expect(countRows("NotificationStatus")).toBe(1);
  });

  it("CleanupOrphanedPendingReleases: deletes rows whose AuthorId no longer matches an Authors row", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const authorId = insertAuthor(authorMetaId);

    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId") VALUES ('kept', '2024-01-01', '{}', ?)`,
      [authorId]
    );
    exec(
      `INSERT INTO "PendingReleases" ("Title", "Added", "Release", "AuthorId") VALUES ('orphan', '2024-01-01', '{}', 9999)`
    );

    new CleanupOrphanedPendingReleases(db).clean();

    const titles = db.openConnection().prepare('SELECT "Title" FROM "PendingReleases"').all() as {
      Title: string;
    }[];
    expect(titles).toEqual([{ Title: "kept" }]);
  });

  it("CleanupOrphanedSeriesBookLinks: deletes links orphaned by Book and links orphaned by Series", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const bookId = insertBook(authorMetaId, "book-1");
    const seriesId = insertSeries("series-1");

    exec(`INSERT INTO "SeriesBookLink" ("SeriesId", "BookId", "IsPrimary") VALUES (?, ?, 1)`, [
      seriesId,
      bookId,
    ]);

    // Book valid, Series doesn't exist. Because of the FK on SeriesId, insert a real series
    // row then delete it out from under the link via a raw statement that bypasses the FK check.
    exec(`PRAGMA foreign_keys = OFF`);
    exec(`INSERT INTO "SeriesBookLink" ("SeriesId", "BookId", "IsPrimary") VALUES (9999, ?, 0)`, [
      bookId,
    ]);
    exec(`INSERT INTO "SeriesBookLink" ("SeriesId", "BookId", "IsPrimary") VALUES (?, 9999, 0)`, [
      seriesId,
    ]);
    exec(`PRAGMA foreign_keys = ON`);

    expect(countRows("SeriesBookLink")).toBe(3);

    new CleanupOrphanedSeriesBookLinks(db).clean();

    expect(countRows("SeriesBookLink")).toBe(1);
  });

  it("CleanupUnusedTags: deletes Tags not referenced by any taggable table's Tags JSON array", () => {
    exec(`INSERT INTO "Tags" ("Label") VALUES ('used')`);
    const usedTagId = Number(
      db.openConnection().prepare("SELECT last_insert_rowid() as id").get()!.id
    );
    exec(`INSERT INTO "Tags" ("Label") VALUES ('unused')`);

    const authorMetaId = insertAuthorMetadata("fa-1");
    exec(
      `INSERT INTO "Authors" ("CleanName", "Path", "Monitored", "AuthorMetadataId", "Tags") VALUES ('a', '/a', 1, ?, ?)`,
      [authorMetaId, JSON.stringify([usedTagId])]
    );

    new CleanupUnusedTags(db).clean();

    const labels = db.openConnection().prepare('SELECT "Label" FROM "Tags"').all() as {
      Label: string;
    }[];
    expect(labels).toEqual([{ Label: "used" }]);
  });

  it("CleanupUnusedTags: deletes every Tags row when nothing references any tag", () => {
    exec(`INSERT INTO "Tags" ("Label") VALUES ('unused-1')`);
    exec(`INSERT INTO "Tags" ("Label") VALUES ('unused-2')`);

    new CleanupUnusedTags(db).clean();

    expect(countRows("Tags")).toBe(0);
  });

  it("FixMultipleMonitoredEditions: re-sets Monitored=1 on the lowest-id row among a multiply-monitored group (preserved C# no-op behavior)", () => {
    const authorMetaId = insertAuthorMetadata("fa-1");
    const bookId = insertBook(authorMetaId, "book-1");
    const ed1 = insertEdition(bookId, "ed-1", 1);
    const ed2 = insertEdition(bookId, "ed-2", 1);

    new FixMultipleMonitoredEditions(db).clean();

    // Both remain monitored=1: the SQL only re-sets Monitored=1 on the already-monitored
    // MIN(Id) row, it never unmonitors ed2 -- see the class's doc comment.
    const rows = db
      .openConnection()
      .prepare('SELECT "Id", "Monitored" FROM "Editions" ORDER BY "Id"')
      .all() as { Id: number; Monitored: number }[];
    expect(rows).toEqual([
      { Id: ed1, Monitored: 1 },
      { Id: ed2, Monitored: 1 },
    ]);
  });
});
