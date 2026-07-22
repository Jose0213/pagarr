-- Ported from Datastore/Migration/005_add_indexer_and_enabled_release_profiles.cs
ALTER TABLE "ReleaseProfiles" ADD COLUMN "Enabled" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "ReleaseProfiles" ADD COLUMN "IndexerId" INTEGER NOT NULL DEFAULT 0;
