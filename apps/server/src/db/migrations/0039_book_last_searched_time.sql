-- Ported from Datastore/Migration/039_book_last_searched_time.cs
ALTER TABLE "Books" ADD COLUMN "LastSearchTime" TEXT NULL;
