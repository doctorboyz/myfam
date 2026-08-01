-- Drop LINE LIFF integration: add display_name to users, preserve any existing
-- LINE display names, then drop the line_links table.
-- NOTE: the User table is mapped to "User" (PascalCase, quoted) in this schema.

-- 1. Add display_name column to "User"
ALTER TABLE "User" ADD COLUMN "display_name" TEXT;

-- 2. Copy existing LINE display names into "User" before removing the link table
UPDATE "User" u
SET "display_name" = ll.display_name
FROM line_links ll
WHERE ll.user_id = u.id AND ll.display_name IS NOT NULL;

-- 3. Drop the line_links table (FK to "User" is removed with it)
DROP TABLE line_links;