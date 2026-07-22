-- Ported from Datastore/Migration/013_update_author_sort_name_again.cs
--
-- Same ToLastFirst() dependency as migration 0009 -- see that file's note.
-- NameLastFirst = ToLastFirst(Name); SortName = Name.ToLower(); SortNameLastFirst = ToLastFirst(Name).ToLower().
-- Ported here as direct lowercase/copy placeholders pending the name-parsing
-- helper port; deferred (see this module's final report).
ALTER TABLE "AuthorMetadata" ADD COLUMN "NameLastFirst" TEXT NULL;
ALTER TABLE "AuthorMetadata" ADD COLUMN "SortNameLastFirst" TEXT NULL;

UPDATE "AuthorMetadata"
SET "NameLastFirst" = "Name",
    "SortName" = lower("Name"),
    "SortNameLastFirst" = lower("Name");

CREATE TABLE "AuthorMetadata_temp" (
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
  "Aliases" TEXT NOT NULL DEFAULT '[]',
  "SortName" TEXT NOT NULL,
  "NameLastFirst" TEXT NOT NULL,
  "SortNameLastFirst" TEXT NOT NULL
);
INSERT INTO "AuthorMetadata_temp" SELECT "Id", "ForeignAuthorId", "TitleSlug", "Name", "Overview", "Disambiguation", "Gender", "Hometown", "Born", "Died", "Status", "Images", "Links", "Genres", "Ratings", "Aliases", "SortName", "NameLastFirst", "SortNameLastFirst" FROM "AuthorMetadata";
DROP TABLE "AuthorMetadata";
ALTER TABLE "AuthorMetadata_temp" RENAME TO "AuthorMetadata";
