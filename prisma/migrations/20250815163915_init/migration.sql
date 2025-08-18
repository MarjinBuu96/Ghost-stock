/*
  Warnings:

  - Added the required column `storeId` to the `Alert` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userEmail" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userEmail" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "expectedMin" INTEGER NOT NULL,
    "expectedMax" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("createdAt", "expectedMax", "expectedMin", "id", "product", "severity", "sku", "status", "systemQty", "userEmail") SELECT "createdAt", "expectedMax", "expectedMin", "id", "product", "severity", "sku", "status", "systemQty", "userEmail" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_userEmail_status_idx" ON "Alert"("userEmail", "status");
CREATE INDEX "Alert_storeId_status_idx" ON "Alert"("storeId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Store_shop_key" ON "Store"("shop");

-- CreateIndex
CREATE INDEX "Store_userEmail_idx" ON "Store"("userEmail");
