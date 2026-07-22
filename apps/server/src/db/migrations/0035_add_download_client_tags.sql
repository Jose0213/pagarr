-- Ported from Datastore/Migration/035_add_download_client_tags.cs
ALTER TABLE "DownloadClients" ADD COLUMN "Tags" TEXT NULL;
