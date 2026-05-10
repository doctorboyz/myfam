-- Migration: Add Tag model with many-to-many to Transaction
-- Replaces the flat String[] tags column with structured Tag model

-- Step 1: Migrate existing String[] tags to Tag + TransactionTag records
-- (Tables already created from previous partial migration attempt)

-- Migrate existing tag data: for each unique (tag_name, user_id), create a Tag
-- then link each transaction to its tags via TransactionTag
INSERT INTO "tags" ("id", "name", "user_id", "family_id")
SELECT DISTINCT ON (unnested.tag, t.created_by_id)
    gen_random_uuid()::text,
    unnested.tag,
    t.created_by_id,
    u.family_id
FROM (
    SELECT id, created_by_id, unnest("tags") AS tag
    FROM "Transaction"
    WHERE array_length("tags", 1) IS NOT NULL
) AS unnested
JOIN "Transaction" t ON unnested.id = t.id
JOIN "User" u ON u.id = t.created_by_id
WHERE unnested.tag IS NOT NULL AND unnested.tag != ''
ON CONFLICT DO NOTHING;

-- Link transactions to their tags
INSERT INTO "transaction_tags" ("id", "transaction_id", "tag_id")
SELECT
    gen_random_uuid()::text,
    t.id,
    tg.id
FROM "Transaction" t
CROSS JOIN LATERAL unnest(t."tags") AS tag_name
JOIN "tags" tg ON tg.name = tag_name AND tg.user_id = t.created_by_id
WHERE tag_name IS NOT NULL AND tag_name != ''
ON CONFLICT DO NOTHING;

-- Step 2: Add foreign keys and constraints (if not already added)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tags_user_id_fkey') THEN
        ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tags_family_id_fkey') THEN
        ALTER TABLE "tags" ADD CONSTRAINT "tags_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transaction_tags_transaction_id_fkey') THEN
        ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transaction_tags_tag_id_fkey') THEN
        ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Step 3: Add unique constraints (if not already added)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'tags_name_user_id_key') THEN
        ALTER TABLE "tags" ADD CONSTRAINT "tags_name_user_id_key" UNIQUE ("name", "user_id");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'transaction_tags_transaction_id_tag_id_key') THEN
        ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_transaction_id_tag_id_key" UNIQUE ("transaction_id", "tag_id");
    END IF;
END $$;

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS "tags_user_id_idx" ON "tags"("user_id");
CREATE INDEX IF NOT EXISTS "tags_family_id_idx" ON "tags"("family_id");
CREATE INDEX IF NOT EXISTS "transaction_tags_transaction_id_idx" ON "transaction_tags"("transaction_id");
CREATE INDEX IF NOT EXISTS "transaction_tags_tag_id_idx" ON "transaction_tags"("tag_id");

-- Step 5: Drop the old tags column (data already migrated)
ALTER TABLE "Transaction" DROP COLUMN IF EXISTS "tags";