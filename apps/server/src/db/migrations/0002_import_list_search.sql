-- Ported from Datastore/Migration/002_import_list_search.cs
ALTER TABLE "ImportLists" ADD COLUMN "ShouldSearch" INTEGER NOT NULL DEFAULT 1;
