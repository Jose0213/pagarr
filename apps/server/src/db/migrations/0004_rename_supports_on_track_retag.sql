-- Ported from Datastore/Migration/004_rename_supports_on_track_retag.cs
-- C# used FluentMigrator's SQLite table-rebuild dance for renames (see
-- NzbDroneSQLiteProcessor.Process(RenameColumnExpression)). Modern SQLite
-- (3.25+, well below the 3.35+ bundled with Node's node:sqlite) supports
-- ALTER TABLE RENAME COLUMN natively, so this is the direct equivalent.
ALTER TABLE "Notifications" RENAME COLUMN "OnTrackRetag" TO "OnBookRetag";
