-- Ported from Datastore/Migration/019_add_new_item_monitor_type.cs
ALTER TABLE "Authors" ADD COLUMN "MonitorNewItems" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "RootFolders" ADD COLUMN "DefaultNewItemMonitorOption" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportLists" ADD COLUMN "MonitorNewItems" INTEGER NOT NULL DEFAULT 0;
