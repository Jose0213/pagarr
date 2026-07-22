-- Ported from Datastore/Migration/017_import_list_monitor_existing.cs
ALTER TABLE "ImportLists" ADD COLUMN "ShouldMonitorExisting" INTEGER NOT NULL DEFAULT 0;
