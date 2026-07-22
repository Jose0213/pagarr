-- Ported from Datastore/Migration/018_add_series_position.cs
ALTER TABLE "SeriesBookLink" ADD COLUMN "SeriesPosition" INTEGER NOT NULL DEFAULT 0;
