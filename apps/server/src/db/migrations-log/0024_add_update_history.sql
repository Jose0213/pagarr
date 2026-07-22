-- Ported from Datastore/Migration/024_add_update_history.cs (LogDbUpgrade -- this migration has no MainDbUpgrade).
CREATE TABLE "UpdateHistory" (
  "Id" INTEGER PRIMARY KEY,
  "Date" TEXT NOT NULL,
  "Version" TEXT NOT NULL,
  "EventType" INTEGER NOT NULL
);
CREATE INDEX "IX_UpdateHistory_Date" ON "UpdateHistory" ("Date");
