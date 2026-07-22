-- Ported from Datastore/Migration/016_add_related_works.cs
ALTER TABLE "Books" ADD COLUMN "RelatedBooks" TEXT NOT NULL DEFAULT '[]';
