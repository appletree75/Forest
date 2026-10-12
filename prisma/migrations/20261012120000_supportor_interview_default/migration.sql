UPDATE "AppSettings"
SET "permissionMatrix" = jsonb_set(
  "permissionMatrix",
  '{supportor}',
  '["view_dashboard", "view_interview", "view_chat", "view_profile"]'::jsonb
),
"updatedAt" = NOW()
WHERE "permissionMatrix"->'supportor' = '["view_dashboard", "view_chat", "view_profile"]'::jsonb;
