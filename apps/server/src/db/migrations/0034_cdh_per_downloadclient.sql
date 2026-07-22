-- Ported from Datastore/Migration/034_cdh_per_downloadclient.cs
--
-- NOTE: this C# migration class is internally decorated [Migration(158)] --
-- a much higher FluentMigrator version number than its file's position in
-- the 000-040 sequence suggests (likely a rebase/cherry-pick artifact
-- upstream). This port preserves the *file ordering* position (034) per the
-- port brief's instruction to keep the numbering sequence of the C# files,
-- not the internal (and inconsistent-with-neighbors) attribute value.
ALTER TABLE "DownloadClients" ADD COLUMN "RemoveCompletedDownloads" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DownloadClients" ADD COLUMN "RemoveFailedDownloads" INTEGER NOT NULL DEFAULT 1;

-- MoveRemoveSettings(): read legacy Config keys 'removecompleteddownloads'/
-- 'removefaileddownloads', apply them to every DownloadClients row (with an
-- RTorrent/Flood-specific override forcing RemoveCompletedDownloads false),
-- then delete the legacy Config keys.
UPDATE "DownloadClients"
SET "RemoveCompletedDownloads" = CASE
      WHEN "Implementation" IN ('RTorrent', 'Flood') THEN 0
      ELSE COALESCE((SELECT lower("Value") FROM "Config" WHERE "Key" = 'removecompleteddownloads') = 'true', 0)
    END,
    "RemoveFailedDownloads" = COALESCE(
      (SELECT lower("Value") FROM "Config" WHERE "Key" = 'removefaileddownloads') <> 'false',
      1
    );

DELETE FROM "Config" WHERE "Key" IN ('removecompleteddownloads', 'removefaileddownloads');
