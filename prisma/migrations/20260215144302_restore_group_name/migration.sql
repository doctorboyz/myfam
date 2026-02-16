/*
  Warnings:

  - Added the required column `name` to the `CategoryGroup` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CategoryGroup" ADD COLUMN     "name" TEXT NOT NULL;
