-- Ported from Datastore/Migration/015_fix_indexes.cs
CREATE INDEX "IX_Editions_BookId" ON "Editions" ("BookId");
