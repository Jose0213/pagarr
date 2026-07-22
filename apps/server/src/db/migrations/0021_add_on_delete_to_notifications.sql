-- Ported from Datastore/Migration/021_add_on_delete_to_notifications.cs
ALTER TABLE "Notifications" ADD COLUMN "OnAuthorDelete" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notifications" ADD COLUMN "OnBookDelete" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notifications" ADD COLUMN "OnBookFileDelete" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Notifications" ADD COLUMN "OnBookFileDeleteForUpgrade" INTEGER NOT NULL DEFAULT 0;
