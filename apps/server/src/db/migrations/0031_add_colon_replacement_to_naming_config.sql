-- Ported from Datastore/Migration/031_add_colon_replacement_to_naming_config.cs
ALTER TABLE "NamingConfig" ADD COLUMN "ColonReplacementFormat" INTEGER NOT NULL DEFAULT 4;
