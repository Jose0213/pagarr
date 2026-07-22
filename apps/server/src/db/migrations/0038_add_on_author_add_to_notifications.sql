-- Ported from Datastore/Migration/038_add_on_author_add_to_notifications.cs
ALTER TABLE "Notifications" ADD COLUMN "OnAuthorAdded" INTEGER NOT NULL DEFAULT 0;
