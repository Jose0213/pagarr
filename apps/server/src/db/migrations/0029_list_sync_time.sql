-- Ported from Datastore/Migration/029_list_sync_time.cs
ALTER TABLE "ImportListStatus" DROP COLUMN "LastSyncListInfo";
ALTER TABLE "ImportListStatus" ADD COLUMN "LastInfoSync" TEXT NULL;
