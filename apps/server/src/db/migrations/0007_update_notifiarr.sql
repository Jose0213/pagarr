-- Ported from Datastore/Migration/007_update_notifiarr.cs
UPDATE "Notifications"
SET "Implementation" = replace("Implementation", 'DiscordNotifier', 'Notifiarr'),
    "ConfigContract" = replace("ConfigContract", 'DiscordNotifierSettings', 'NotifiarrSettings')
WHERE "Implementation" = 'DiscordNotifier';
