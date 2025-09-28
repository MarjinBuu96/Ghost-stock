/*
  Warnings:

  - You are about to drop the column `userEmail` on the `Alert` table. All the data in the column will be lost.
  - You are about to drop the column `orgId` on the `Store` table. All the data in the column will be lost.
  - You are about to drop the column `userEmail` on the `Store` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."Store" DROP CONSTRAINT "Store_orgId_fkey";

-- DropIndex
DROP INDEX "public"."Alert_userEmail_status_idx";

-- DropIndex
DROP INDEX "public"."Store_userEmail_idx";

-- AlterTable
ALTER TABLE "public"."Alert" DROP COLUMN "userEmail";

-- AlterTable
ALTER TABLE "public"."Store" DROP COLUMN "orgId",
DROP COLUMN "userEmail",
ADD COLUMN     "organizationId" TEXT;

-- AddForeignKey
ALTER TABLE "public"."Store" ADD CONSTRAINT "Store_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "public"."Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
