-- CreateTable
CREATE TABLE "user_aliases" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "user_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_aliases_owner_id_target_id_key" ON "user_aliases"("owner_id", "target_id");

-- AddForeignKey
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_aliases" ADD CONSTRAINT "user_aliases_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
