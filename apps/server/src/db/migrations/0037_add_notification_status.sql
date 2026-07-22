-- Ported from Datastore/Migration/037_add_notification_status.cs
CREATE TABLE "NotificationStatus" (
  "Id" INTEGER PRIMARY KEY,
  "ProviderId" INTEGER NOT NULL UNIQUE,
  "InitialFailure" TEXT NULL,
  "MostRecentFailure" TEXT NULL,
  "EscalationLevel" INTEGER NOT NULL,
  "DisabledTill" TEXT NULL
);
