-- Ported from Datastore/Migration/001_initial_setup.cs (MainDbUpgrade only;
-- LogDbUpgrade -> migrations-log/0001_initial_setup.sql, CacheDbUpgrade ->
-- migrations-cache/0001_initial_setup.sql).
--
-- Every Create.TableForModel(...) call implies an "Id" INTEGER PRIMARY KEY
-- (FluentMigrator's `.WithColumn("Id").AsInt32().PrimaryKey().Identity()`,
-- see Migration/Framework/MigrationExtension.cs TableForModel()). SQLite's
-- `INTEGER PRIMARY KEY` column is itself the auto-incrementing rowid alias,
-- so that's the faithful translation (no need for AUTOINCREMENT keyword,
-- which only exists to prevent rowid reuse -- not part of the original
-- semantics).

CREATE TABLE "Config" (
  "Id" INTEGER PRIMARY KEY,
  "Key" TEXT NOT NULL UNIQUE,
  "Value" TEXT NOT NULL
);

CREATE TABLE "RootFolders" (
  "Id" INTEGER PRIMARY KEY,
  "Path" TEXT NOT NULL UNIQUE,
  "Name" TEXT NULL,
  "DefaultMetadataProfileId" INTEGER NOT NULL DEFAULT 0,
  "DefaultQualityProfileId" INTEGER NOT NULL DEFAULT 0,
  "DefaultMonitorOption" INTEGER NOT NULL DEFAULT 0,
  "DefaultTags" TEXT NULL,
  "IsCalibreLibrary" INTEGER NOT NULL,
  "CalibreSettings" TEXT NULL
);

CREATE TABLE "Authors" (
  "Id" INTEGER PRIMARY KEY,
  "CleanName" TEXT NOT NULL,
  "Path" TEXT NOT NULL,
  "Monitored" INTEGER NOT NULL,
  "LastInfoSync" TEXT NULL,
  "SortName" TEXT NULL,
  "QualityProfileId" INTEGER NULL,
  "Tags" TEXT NULL,
  "Added" TEXT NULL,
  "AddOptions" TEXT NULL,
  "MetadataProfileId" INTEGER NOT NULL DEFAULT 1,
  "AuthorMetadataId" INTEGER NOT NULL UNIQUE
);
CREATE INDEX "IX_Authors_CleanName" ON "Authors" ("CleanName");
CREATE INDEX "IX_Authors_Path" ON "Authors" ("Path");

CREATE TABLE "Books" (
  "Id" INTEGER PRIMARY KEY,
  "AuthorMetadataId" INTEGER NOT NULL DEFAULT 0,
  "ForeignBookId" TEXT NOT NULL,
  "TitleSlug" TEXT NOT NULL UNIQUE,
  "Title" TEXT NOT NULL,
  "ReleaseDate" TEXT NULL,
  "Links" TEXT NULL,
  "Genres" TEXT NULL,
  "Ratings" TEXT NULL,
  "CleanTitle" TEXT NOT NULL,
  "Monitored" INTEGER NOT NULL,
  "AnyEditionOk" INTEGER NOT NULL,
  "LastInfoSync" TEXT NULL,
  "Added" TEXT NULL,
  "AddOptions" TEXT NULL
);
CREATE INDEX "IX_Books_ForeignBookId" ON "Books" ("ForeignBookId");
CREATE INDEX "IX_Books_CleanTitle" ON "Books" ("CleanTitle");

CREATE TABLE "Series" (
  "Id" INTEGER PRIMARY KEY,
  "ForeignSeriesId" TEXT NOT NULL UNIQUE,
  "Title" TEXT NOT NULL,
  "Description" TEXT NULL,
  "Numbered" INTEGER NOT NULL,
  "WorkCount" INTEGER NOT NULL,
  "PrimaryWorkCount" INTEGER NOT NULL
);

CREATE TABLE "SeriesBookLink" (
  "Id" INTEGER PRIMARY KEY,
  "SeriesId" INTEGER NOT NULL REFERENCES "Series" ("Id") ON DELETE CASCADE,
  "BookId" INTEGER NOT NULL REFERENCES "Books" ("Id") ON DELETE CASCADE,
  "Position" TEXT NULL,
  "IsPrimary" INTEGER NOT NULL
);
CREATE INDEX "IX_SeriesBookLink_SeriesId" ON "SeriesBookLink" ("SeriesId");

CREATE TABLE "AuthorMetadata" (
  "Id" INTEGER PRIMARY KEY,
  "ForeignAuthorId" TEXT NOT NULL UNIQUE,
  "TitleSlug" TEXT NOT NULL UNIQUE,
  "Name" TEXT NOT NULL,
  "Overview" TEXT NULL,
  "Disambiguation" TEXT NULL,
  "Gender" TEXT NULL,
  "Hometown" TEXT NULL,
  "Born" TEXT NULL,
  "Died" TEXT NULL,
  "Status" INTEGER NOT NULL,
  "Images" TEXT NOT NULL,
  "Links" TEXT NULL,
  "Genres" TEXT NULL,
  "Ratings" TEXT NULL,
  "Aliases" TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE "Editions" (
  "Id" INTEGER PRIMARY KEY,
  "BookId" INTEGER NOT NULL DEFAULT 0,
  "ForeignEditionId" TEXT NOT NULL UNIQUE,
  "Isbn13" TEXT NULL,
  "Asin" TEXT NULL,
  "Title" TEXT NOT NULL,
  "TitleSlug" TEXT NOT NULL,
  "Language" TEXT NULL,
  "Overview" TEXT NULL,
  "Format" TEXT NULL,
  "IsEbook" INTEGER NULL,
  "Disambiguation" TEXT NULL,
  "Publisher" TEXT NULL,
  "PageCount" INTEGER NULL,
  "ReleaseDate" TEXT NULL,
  "Images" TEXT NOT NULL,
  "Links" TEXT NULL,
  "Ratings" TEXT NULL,
  "Monitored" INTEGER NOT NULL,
  "ManualAdd" INTEGER NOT NULL
);

CREATE TABLE "BookFiles" (
  "Id" INTEGER PRIMARY KEY,
  "EditionId" INTEGER NOT NULL,
  "CalibreId" INTEGER NOT NULL,
  "Quality" TEXT NOT NULL,
  "Size" INTEGER NOT NULL,
  "SceneName" TEXT NULL,
  "DateAdded" TEXT NOT NULL,
  "ReleaseGroup" TEXT NULL,
  "MediaInfo" TEXT NULL,
  "Modified" TEXT NOT NULL DEFAULT '2000-01-01 00:00:00',
  "Path" TEXT NOT NULL UNIQUE
);
CREATE INDEX "IX_BookFiles_EditionId" ON "BookFiles" ("EditionId");

CREATE TABLE "History" (
  "Id" INTEGER PRIMARY KEY,
  "SourceTitle" TEXT NOT NULL,
  "Date" TEXT NOT NULL,
  "Quality" TEXT NOT NULL,
  "Data" TEXT NOT NULL,
  "EventType" INTEGER NULL,
  "DownloadId" TEXT NULL,
  "AuthorId" INTEGER NOT NULL DEFAULT 0,
  "BookId" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "IX_History_Date" ON "History" ("Date");
CREATE INDEX "IX_History_EventType" ON "History" ("EventType");
CREATE INDEX "IX_History_DownloadId" ON "History" ("DownloadId");
CREATE INDEX "IX_History_BookId" ON "History" ("BookId");

CREATE TABLE "Notifications" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL,
  "OnGrab" INTEGER NOT NULL,
  "Settings" TEXT NOT NULL,
  "Implementation" TEXT NOT NULL,
  "ConfigContract" TEXT NULL,
  "OnUpgrade" INTEGER NULL,
  "Tags" TEXT NULL,
  "OnRename" INTEGER NOT NULL,
  "OnReleaseImport" INTEGER NOT NULL DEFAULT 0,
  "OnHealthIssue" INTEGER NOT NULL DEFAULT 0,
  "IncludeHealthWarnings" INTEGER NOT NULL DEFAULT 0,
  "OnDownloadFailure" INTEGER NOT NULL DEFAULT 0,
  "OnImportFailure" INTEGER NOT NULL DEFAULT 0,
  "OnTrackRetag" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "ScheduledTasks" (
  "Id" INTEGER PRIMARY KEY,
  "TypeName" TEXT NOT NULL UNIQUE,
  "Interval" INTEGER NOT NULL,
  "LastExecution" TEXT NOT NULL,
  "LastStartTime" TEXT NULL
);

CREATE TABLE "Indexers" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "Implementation" TEXT NOT NULL,
  "Settings" TEXT NULL,
  "ConfigContract" TEXT NULL,
  "EnableRss" INTEGER NULL,
  "EnableAutomaticSearch" INTEGER NULL,
  "EnableInteractiveSearch" INTEGER NOT NULL
);

CREATE TABLE "QualityProfiles" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "Cutoff" INTEGER NOT NULL,
  "Items" TEXT NOT NULL,
  "UpgradeAllowed" INTEGER NULL
);

CREATE TABLE "MetadataProfiles" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "MinPopularity" REAL NOT NULL,
  "SkipMissingDate" INTEGER NOT NULL,
  "SkipMissingIsbn" INTEGER NOT NULL,
  "SkipPartsAndSets" INTEGER NOT NULL,
  "SkipSeriesSecondary" INTEGER NOT NULL,
  "AllowedLanguages" TEXT NULL
);

CREATE TABLE "QualityDefinitions" (
  "Id" INTEGER PRIMARY KEY,
  "Quality" INTEGER NOT NULL UNIQUE,
  "Title" TEXT NOT NULL UNIQUE,
  "MinSize" REAL NULL,
  "MaxSize" REAL NULL
);

CREATE TABLE "NamingConfig" (
  "Id" INTEGER PRIMARY KEY,
  "ReplaceIllegalCharacters" INTEGER NOT NULL DEFAULT 1,
  "AuthorFolderFormat" TEXT NULL,
  "RenameBooks" INTEGER NULL,
  "StandardBookFormat" TEXT NULL
);

CREATE TABLE "Blacklist" (
  "Id" INTEGER PRIMARY KEY,
  "SourceTitle" TEXT NOT NULL,
  "Quality" TEXT NOT NULL,
  "Date" TEXT NOT NULL,
  "PublishedDate" TEXT NULL,
  "Size" INTEGER NULL,
  "Protocol" INTEGER NULL,
  "Indexer" TEXT NULL,
  "Message" TEXT NULL,
  "TorrentInfoHash" TEXT NULL,
  "AuthorId" INTEGER NOT NULL DEFAULT 0,
  "BookIds" TEXT NOT NULL DEFAULT ''
);

CREATE TABLE "Metadata" (
  "Id" INTEGER PRIMARY KEY,
  "Enable" INTEGER NOT NULL,
  "Name" TEXT NOT NULL,
  "Implementation" TEXT NOT NULL,
  "Settings" TEXT NOT NULL,
  "ConfigContract" TEXT NOT NULL
);

CREATE TABLE "MetadataFiles" (
  "Id" INTEGER PRIMARY KEY,
  "AuthorId" INTEGER NOT NULL,
  "Consumer" TEXT NOT NULL,
  "Type" INTEGER NOT NULL,
  "RelativePath" TEXT NOT NULL,
  "LastUpdated" TEXT NOT NULL,
  "BookId" INTEGER NULL,
  "BookFileId" INTEGER NULL,
  "Hash" TEXT NULL,
  "Added" TEXT NULL,
  "Extension" TEXT NOT NULL
);

CREATE TABLE "DownloadClients" (
  "Id" INTEGER PRIMARY KEY,
  "Enable" INTEGER NOT NULL,
  "Name" TEXT NOT NULL,
  "Implementation" TEXT NOT NULL,
  "Settings" TEXT NOT NULL,
  "ConfigContract" TEXT NOT NULL,
  "Priority" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE "PendingReleases" (
  "Id" INTEGER PRIMARY KEY,
  "Title" TEXT NOT NULL,
  "Added" TEXT NOT NULL,
  "Release" TEXT NOT NULL,
  "AuthorId" INTEGER NOT NULL DEFAULT 0,
  "ParsedBookInfo" TEXT NOT NULL DEFAULT '',
  "Reason" INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "RemotePathMappings" (
  "Id" INTEGER PRIMARY KEY,
  "Host" TEXT NOT NULL,
  "RemotePath" TEXT NOT NULL,
  "LocalPath" TEXT NOT NULL
);

CREATE TABLE "Tags" (
  "Id" INTEGER PRIMARY KEY,
  "Label" TEXT NOT NULL UNIQUE
);

CREATE TABLE "ReleaseProfiles" (
  "Id" INTEGER PRIMARY KEY,
  "Required" TEXT NULL,
  "Preferred" TEXT NULL,
  "Ignored" TEXT NULL,
  "Tags" TEXT NOT NULL,
  "IncludePreferredWhenRenaming" INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE "DelayProfiles" (
  "Id" INTEGER PRIMARY KEY,
  "EnableUsenet" INTEGER NOT NULL,
  "EnableTorrent" INTEGER NOT NULL,
  "PreferredProtocol" INTEGER NOT NULL,
  "UsenetDelay" INTEGER NOT NULL,
  "TorrentDelay" INTEGER NOT NULL,
  "Order" INTEGER NOT NULL,
  "Tags" TEXT NOT NULL
);

CREATE TABLE "Users" (
  "Id" INTEGER PRIMARY KEY,
  "Identifier" TEXT NOT NULL UNIQUE,
  "Username" TEXT NOT NULL UNIQUE,
  "Password" TEXT NOT NULL
);

CREATE TABLE "Commands" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL,
  "Body" TEXT NOT NULL,
  "Priority" INTEGER NOT NULL,
  "Status" INTEGER NOT NULL,
  "QueuedAt" TEXT NOT NULL,
  "StartedAt" TEXT NULL,
  "EndedAt" TEXT NULL,
  "Duration" TEXT NULL,
  "Exception" TEXT NULL,
  "Trigger" INTEGER NOT NULL
);

CREATE TABLE "IndexerStatus" (
  "Id" INTEGER PRIMARY KEY,
  "ProviderId" INTEGER NOT NULL UNIQUE,
  "InitialFailure" TEXT NULL,
  "MostRecentFailure" TEXT NULL,
  "EscalationLevel" INTEGER NOT NULL,
  "DisabledTill" TEXT NULL,
  "LastRssSyncReleaseInfo" TEXT NULL
);

CREATE TABLE "ExtraFiles" (
  "Id" INTEGER PRIMARY KEY,
  "AuthorId" INTEGER NOT NULL,
  "BookId" INTEGER NOT NULL,
  "BookFileId" INTEGER NOT NULL,
  "RelativePath" TEXT NOT NULL,
  "Extension" TEXT NOT NULL,
  "Added" TEXT NOT NULL,
  "LastUpdated" TEXT NOT NULL
);

CREATE TABLE "DownloadClientStatus" (
  "Id" INTEGER PRIMARY KEY,
  "ProviderId" INTEGER NOT NULL UNIQUE,
  "InitialFailure" TEXT NULL,
  "MostRecentFailure" TEXT NULL,
  "EscalationLevel" INTEGER NOT NULL,
  "DisabledTill" TEXT NULL
);

CREATE TABLE "ImportLists" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "Implementation" TEXT NOT NULL,
  "Settings" TEXT NULL,
  "ConfigContract" TEXT NULL,
  "EnableAutomaticAdd" INTEGER NULL,
  "RootFolderPath" TEXT NOT NULL,
  "ShouldMonitor" INTEGER NOT NULL,
  "ProfileId" INTEGER NOT NULL,
  "MetadataProfileId" INTEGER NOT NULL,
  "Tags" TEXT NULL
);

CREATE TABLE "ImportListStatus" (
  "Id" INTEGER PRIMARY KEY,
  "ProviderId" INTEGER NOT NULL UNIQUE,
  "InitialFailure" TEXT NULL,
  "MostRecentFailure" TEXT NULL,
  "EscalationLevel" INTEGER NOT NULL,
  "DisabledTill" TEXT NULL,
  "LastSyncListInfo" TEXT NULL
);

CREATE TABLE "ImportListExclusions" (
  "Id" INTEGER PRIMARY KEY,
  "ForeignId" TEXT NOT NULL UNIQUE,
  "Name" TEXT NOT NULL
);

CREATE TABLE "CustomFilters" (
  "Id" INTEGER PRIMARY KEY,
  "Type" TEXT NOT NULL,
  "Label" TEXT NOT NULL,
  "Filters" TEXT NOT NULL
);

-- Delete.Index().OnTable("History").OnColumn("BookId"); Create.Index()...OnColumn("BookId").Ascending().OnColumn("Date").Descending();
-- The plain single-column BookId index created above is superseded by this
-- composite one; SQLite has no "drop then recreate the same name" concern
-- here since we only ever create the final, composite form directly.
DROP INDEX "IX_History_BookId";
CREATE INDEX "IX_History_BookId_Date" ON "History" ("BookId" ASC, "Date" DESC);

-- Delete.Index().OnTable("History").OnColumn("DownloadId"); Create.Index()...OnColumn("DownloadId").Ascending().OnColumn("Date").Descending();
DROP INDEX "IX_History_DownloadId";
CREATE INDEX "IX_History_DownloadId_Date" ON "History" ("DownloadId" ASC, "Date" DESC);

CREATE INDEX "IX_Authors_Monitored" ON "Authors" ("Monitored" ASC);

CREATE INDEX "IX_Books_AuthorMetadataId" ON "Books" ("AuthorMetadataId" ASC);
CREATE INDEX "IX_Books_AuthorMetadataId_ReleaseDate" ON "Books" ("AuthorMetadataId" ASC, "ReleaseDate" ASC);

INSERT INTO "DelayProfiles" ("EnableUsenet", "EnableTorrent", "PreferredProtocol", "UsenetDelay", "TorrentDelay", "Order", "Tags")
VALUES (1, 1, 1, 0, 0, 2147483647, '[]');
