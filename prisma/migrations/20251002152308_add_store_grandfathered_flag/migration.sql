-- AlterTable
ALTER TABLE "public"."Store" ADD COLUMN     "grandfathered" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Store_grandfathered_idx" ON "public"."Store"("grandfathered");
