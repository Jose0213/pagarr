-- Ported from Datastore/Migration/020_add_download_history.cs
--
-- C# additionally backfilled DownloadHistory from qualifying History rows
-- (EventType IN Grabbed/DownloadFolderImported/DownloadFailed/
-- DownloadIgnored/DownloadImportIncomplete, mapped to the new
-- DownloadHistoryType numbering, grouped by EventType+DownloadId, with
-- "indexer"/"downloadClient" keys pulled out of History's JSON Data blob).
-- That's a real one-time ETL over JSON blob contents with an event-type
-- remapping table -- expressible in SQLite via json_extract, ported below
-- as a faithful direct SQL translation of InitialImportedDownloadHistory().
CREATE TABLE "DownloadHistory" (
  "Id" INTEGER PRIMARY KEY,
  "EventType" INTEGER NOT NULL,
  "AuthorId" INTEGER NOT NULL,
  "DownloadId" TEXT NOT NULL,
  "SourceTitle" TEXT NOT NULL,
  "Date" TEXT NOT NULL,
  "Protocol" INTEGER NULL,
  "IndexerId" INTEGER NULL,
  "DownloadClientId" INTEGER NULL,
  "Release" TEXT NULL,
  "Data" TEXT NULL
);
CREATE INDEX "IX_DownloadHistory_EventType" ON "DownloadHistory" ("EventType");
CREATE INDEX "IX_DownloadHistory_AuthorId" ON "DownloadHistory" ("AuthorId");
CREATE INDEX "IX_DownloadHistory_DownloadId" ON "DownloadHistory" ("DownloadId");

-- EventTypeMap: History EventType -> DownloadHistory EventType
--   1 (Grabbed) -> 1 (Grabbed)
--   8 (DownloadFolderImported) -> 2 (DownloadImported)
--   4 (DownloadFailed) -> 3 (DownloadFailed)
--   10 (DownloadIgnored) -> 4 (DownloadIgnored)
--   7 (DownloadImportIncomplete) -> 6 (DownloadImportIncomplete)
INSERT INTO "DownloadHistory" ("EventType", "AuthorId", "DownloadId", "SourceTitle", "Date", "Protocol", "Data")
SELECT
  CASE h."EventType"
    WHEN 1 THEN 1
    WHEN 8 THEN 2
    WHEN 4 THEN 3
    WHEN 10 THEN 4
    WHEN 7 THEN 6
  END,
  h."AuthorId",
  h."DownloadId",
  h."SourceTitle",
  h."Date",
  CAST(json_extract(h."Data", '$.protocol') AS INTEGER),
  json_object(
    'indexer', json_extract(h."Data", '$.indexer'),
    'downloadClient', json_extract(h."Data", '$.downloadClient')
  )
FROM "History" h
WHERE h."DownloadId" IS NOT NULL
  AND h."EventType" IN (1, 8, 4, 10, 7)
GROUP BY h."EventType", h."DownloadId";
