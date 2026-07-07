ALTER TABLE "Profile"
ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ordered_profiles AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "fullName" ASC, id ASC) AS next_order
  FROM "Profile"
)
UPDATE "Profile" AS p
SET "sortOrder" = ordered_profiles.next_order
FROM ordered_profiles
WHERE p.id = ordered_profiles.id;

CREATE INDEX "Profile_sortOrder_idx" ON "Profile"("sortOrder");
