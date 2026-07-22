-- Ported from Datastore/Migration/001_initial_setup.cs CacheDbUpgrade().
CREATE TABLE "HttpResponse" (
  "Id" INTEGER PRIMARY KEY,
  "Url" TEXT NOT NULL,
  "LastRefresh" TEXT NOT NULL,
  "Expiry" TEXT NOT NULL,
  "Value" TEXT NOT NULL,
  "StatusCode" INTEGER NOT NULL
);
CREATE INDEX "IX_HttpResponse_Url" ON "HttpResponse" ("Url");
CREATE INDEX "IX_HttpResponse_Expiry" ON "HttpResponse" ("Expiry");
