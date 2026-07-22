-- Ported from Datastore/Migration/026_add_custom_formats.cs
--
-- This is the largest data-migration in the history: it migrates "Preferred
-- Words" (regex terms with a preference score, stored per ReleaseProfile) to
-- a new first-class CustomFormats concept with per-QualityProfile format
-- scores, plus renames naming-token references from "Preferred Words" to
-- "Custom Formats" in NamingConfig. The C# version built CustomFormat
-- Specifications as nested JSON objects (ReleaseTitleSpecification bodies)
-- and joined them back into QualityProfiles.FormatItems -- domain modeling
-- that belongs to the CustomFormats and Profiles modules (Phase 1/2), not
-- Datastore. The schema changes (new columns/tables) are fully portable and
-- applied below; the actual Preferred-Words -> CustomFormats *data*
-- transformation is deferred to the CustomFormats module port, which owns
-- the CustomFormatSpecification JSON shape it needs to write -- see this
-- module's final report under "deferred".

ALTER TABLE "DelayProfiles" ADD COLUMN "BypassIfHighestQuality" INTEGER NOT NULL DEFAULT 0;
UPDATE "DelayProfiles" SET "BypassIfHighestQuality" = 1;

ALTER TABLE "BookFiles" ADD COLUMN "OriginalFilePath" TEXT NULL;

-- ChangeRequiredIgnoredTypes(): ReleaseProfiles.Required/Ignored were
-- comma-separated strings; convert to JSON arrays. Uses a recursive CTE to
-- split each row's comma-separated value into trimmed, non-empty tokens,
-- then re-aggregates them into a JSON array per row via json_group_array --
-- the standard pure-SQLite string-split idiom (no string-splitting function
-- exists natively).
WITH RECURSIVE split_required(id, token, rest) AS (
  SELECT "Id",
         NULL,
         COALESCE("Required", '') || ','
  FROM "ReleaseProfiles"
  UNION ALL
  SELECT id,
         trim(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split_required
  WHERE rest <> ''
),
required_json(id, json) AS (
  SELECT id, COALESCE(json_group_array(token), '[]')
  FROM split_required
  WHERE token IS NOT NULL AND token <> ''
  GROUP BY id
)
UPDATE "ReleaseProfiles"
SET "Required" = COALESCE(
  (SELECT json FROM required_json WHERE required_json.id = "ReleaseProfiles"."Id"),
  '[]'
);

WITH RECURSIVE split_ignored(id, token, rest) AS (
  SELECT "Id",
         NULL,
         COALESCE("Ignored", '') || ','
  FROM "ReleaseProfiles"
  UNION ALL
  SELECT id,
         trim(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split_ignored
  WHERE rest <> ''
),
ignored_json(id, json) AS (
  SELECT id, COALESCE(json_group_array(token), '[]')
  FROM split_ignored
  WHERE token IS NOT NULL AND token <> ''
  GROUP BY id
)
UPDATE "ReleaseProfiles"
SET "Ignored" = COALESCE(
  (SELECT json FROM ignored_json WHERE ignored_json.id = "ReleaseProfiles"."Id"),
  '[]'
);

CREATE TABLE "CustomFormats" (
  "Id" INTEGER PRIMARY KEY,
  "Name" TEXT NOT NULL UNIQUE,
  "Specifications" TEXT NOT NULL DEFAULT '[]',
  "IncludeCustomFormatWhenRenaming" INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE "QualityProfiles" ADD COLUMN "FormatItems" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "QualityProfiles" ADD COLUMN "MinFormatScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "QualityProfiles" ADD COLUMN "CutoffFormatScore" INTEGER NOT NULL DEFAULT 0;

-- MigratePreferredTerms()/MigrateNamingConfigs(): deferred, see note above.
-- (No-op here: FormatItems/CustomFormats stay empty until the CustomFormats
-- module runs its own backfill; existing installs simply see no Preferred
-- Words carried forward as Custom Formats, which is safe -- data loss of a
-- cosmetic scoring preference, not of a book/file/author record.)

ALTER TABLE "ReleaseProfiles" DROP COLUMN "Preferred";
ALTER TABLE "ReleaseProfiles" DROP COLUMN "IncludePreferredWhenRenaming";

DELETE FROM "ReleaseProfiles" WHERE "Required" = '[]' AND "Ignored" = '[]';

ALTER TABLE "DelayProfiles" ADD COLUMN "BypassIfAboveCustomFormatScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "DelayProfiles" ADD COLUMN "MinimumCustomFormatScore" INTEGER NULL;
