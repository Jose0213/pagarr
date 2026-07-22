-- Ported from Datastore/Migration/001_initial_setup.cs LogDbUpgrade().
CREATE TABLE "Logs" (
  "Id" INTEGER PRIMARY KEY,
  "Message" TEXT NOT NULL,
  "Time" TEXT NOT NULL,
  "Logger" TEXT NOT NULL,
  "Exception" TEXT NULL,
  "ExceptionType" TEXT NULL,
  "Level" TEXT NOT NULL
);
CREATE INDEX "IX_Logs_Time" ON "Logs" ("Time");
