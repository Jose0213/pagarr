-- Ported from Datastore/Migration/025_add_on_update_to_notifications.cs
ALTER TABLE "Notifications" ADD COLUMN "OnApplicationUpdate" INTEGER NOT NULL DEFAULT 1;
