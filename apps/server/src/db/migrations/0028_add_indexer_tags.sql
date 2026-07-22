-- Ported from Datastore/Migration/028_add_indexer_tags.cs
ALTER TABLE "Indexers" ADD COLUMN "Tags" TEXT NULL;
