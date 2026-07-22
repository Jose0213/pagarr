-- Ported from Datastore/Migration/040_add_indexer_flags.cs
ALTER TABLE "Blocklist" ADD COLUMN "IndexerFlags" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BookFiles" ADD COLUMN "IndexerFlags" INTEGER NOT NULL DEFAULT 0;
