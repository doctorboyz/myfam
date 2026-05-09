-- CreateTable
CREATE TABLE "line_links" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_links_line_user_id_key" ON "line_links"("line_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "line_links_user_id_key" ON "line_links"("user_id");

-- AddForeignKey
ALTER TABLE "line_links" ADD CONSTRAINT "line_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
