-- AlterTable
ALTER TABLE "public"."UserSettings" ADD COLUMN     "locationIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "useMultiLocation" BOOLEAN NOT NULL DEFAULT false;
