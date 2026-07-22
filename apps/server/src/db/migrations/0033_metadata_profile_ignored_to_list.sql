-- Ported from Datastore/Migration/033_metadata_profile_ignored_to_list.cs
--
-- C# read each MetadataProfiles.Ignored value, tried to parse it as a JSON
-- array (JArray) and left it alone if it already was one, otherwise treated
-- it as a comma-separated string, split/trimmed/deduped it, and wrote it
-- back as a JSON array. Ported here with the same idempotency guard (skip
-- rows that already parse as a JSON array) using the same recursive-CTE
-- comma-split idiom as migration 0026, plus DISTINCT for the dedup step
-- (json_group_array(DISTINCT token) matches C#'s `.Distinct()`).
WITH RECURSIVE split_ignored(id, token, rest) AS (
  SELECT "Id",
         NULL,
         COALESCE("Ignored", '') || ','
  FROM "MetadataProfiles"
  WHERE "Ignored" IS NOT NULL
    AND trim("Ignored") <> ''
    AND json_valid("Ignored") = 0
  UNION ALL
  SELECT id,
         trim(substr(rest, 1, instr(rest, ',') - 1)),
         substr(rest, instr(rest, ',') + 1)
  FROM split_ignored
  WHERE rest <> ''
),
ignored_json(id, json) AS (
  SELECT id, COALESCE(json_group_array(DISTINCT token), '[]')
  FROM split_ignored
  WHERE token IS NOT NULL AND token <> ''
  GROUP BY id
)
UPDATE "MetadataProfiles"
SET "Ignored" = (SELECT json FROM ignored_json WHERE ignored_json.id = "MetadataProfiles"."Id")
WHERE "Id" IN (SELECT id FROM ignored_json);
