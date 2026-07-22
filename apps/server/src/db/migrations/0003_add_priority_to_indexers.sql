-- Ported from Datastore/Migration/003_add_priority_to_indexers.cs
ALTER TABLE "Indexers" ADD COLUMN "Priority" INTEGER NOT NULL DEFAULT 25;
