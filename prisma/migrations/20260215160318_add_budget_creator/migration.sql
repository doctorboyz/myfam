-- AlterTable
ALTER TABLE "Budget" ADD COLUMN     "created_by_id" TEXT NOT NULL DEFAULT 'user_id_placeholder';

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
