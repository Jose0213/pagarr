-- Ported from Datastore/Migration/010_add_bookfile_part.cs
ALTER TABLE "BookFiles" ADD COLUMN "Part" INTEGER NOT NULL DEFAULT 1;
