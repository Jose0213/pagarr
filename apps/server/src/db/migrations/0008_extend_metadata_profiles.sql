-- Ported from Datastore/Migration/008_extend_metadata_profiles.cs
ALTER TABLE "MetadataProfiles" ADD COLUMN "MinPages" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MetadataProfiles" ADD COLUMN "Ignored" TEXT NULL;
