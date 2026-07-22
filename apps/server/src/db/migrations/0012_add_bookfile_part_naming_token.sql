-- Ported from Datastore/Migration/012_add_bookfile_part_naming_token.cs
UPDATE "NamingConfig" SET "StandardBookFormat" = "StandardBookFormat" || '{ (PartNumber)}';
