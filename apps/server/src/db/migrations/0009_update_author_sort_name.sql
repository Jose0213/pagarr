-- Ported from Datastore/Migration/009_update_author_sort_name.cs
--
-- C# added a nullable SortName column to AuthorMetadata, backfilled it from
-- Name via a "ToLastFirst().ToLower()" transform (a name-parsing helper from
-- NzbDrone.Common.Extensions -- turns "First Last" into "last, first"), then
-- widened the column to NOT NULL, and finally dropped the old Authors.SortName
-- column (superseded by AuthorMetadata.SortName).
--
-- The ToLastFirst() name-parsing logic is real domain logic (splits on the
-- last whitespace-separated token, handles single-word names, etc.) that
-- lives in NzbDrone.Common.Extensions -- not part of the Datastore module,
-- and not expressible as a pure-SQL transform. It's ported as a plain SQL
-- lowercase-of-Name placeholder here (so the column is NOT NULL and
-- populated, preserving the schema shape), with the actual last-first
-- backfill deferred to whichever module ports NzbDrone.Common.Extensions'
-- string-formatting helpers -- see this module's final report.
ALTER TABLE "AuthorMetadata" ADD COLUMN "SortName" TEXT NULL;

UPDATE "AuthorMetadata" SET "SortName" = lower("Name");

-- SQLite has no ALTER COLUMN; NOT NULL widening (Alter.Table(...).AlterColumn(...).AsString().NotNullable())
-- requires the table-rebuild dance C#'s NzbDroneSQLiteProcessor performed
-- for AlterColumnExpression. All rows are already populated by the UPDATE
-- above, so this enforces the constraint going forward via table rebuild.
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
  "SortName" TEXT NOT NULL
);
INSERT INTO "AuthorMetadata_temp" SELECT "Id", "ForeignAuthorId", "TitleSlug", "Name", "Overview", "Disambiguation", "Gender", "Hometown", "Born", "Died", "Status", "Images", "Links", "Genres", "Ratings", "Aliases", "SortName" FROM "AuthorMetadata";
DROP TABLE "AuthorMetadata";
ALTER TABLE "AuthorMetadata_temp" RENAME TO "AuthorMetadata";

ALTER TABLE "Authors" DROP COLUMN "SortName";
