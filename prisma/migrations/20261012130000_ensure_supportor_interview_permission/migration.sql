UPDATE "AppSettings"
SET "permissionMatrix" = jsonb_set(
  "permissionMatrix",
  '{supportor}',
  ("permissionMatrix"->'supportor') || '["view_interview"]'::jsonb
),
"updatedAt" = NOW()
WHERE jsonb_typeof("permissionMatrix"->'supportor') = 'array'
  AND NOT ("permissionMatrix"->'supportor' @> '["view_interview"]'::jsonb);
