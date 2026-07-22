-- Ported from Datastore/Migration/030_download_client_per_indexer.cs
ALTER TABLE "Indexers" ADD COLUMN "DownloadClientId" INTEGER NOT NULL DEFAULT 0;
