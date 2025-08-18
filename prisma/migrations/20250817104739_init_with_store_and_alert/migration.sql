/*
  Warnings:

  - Added the required column `uniqueHash` to the `Alert` table without a default value. This is not possible if the table is not empty.

*/
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
    "uniqueHash" TEXT NOT NULL,
    CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Alert" ("createdAt", "expectedMax", "expectedMin", "id", "product", "severity", "sku", "status", "storeId", "systemQty", "userEmail") SELECT "createdAt", "expectedMax", "expectedMin", "id", "product", "severity", "sku", "status", "storeId", "systemQty", "userEmail" FROM "Alert";
DROP TABLE "Alert";
ALTER TABLE "new_Alert" RENAME TO "Alert";
CREATE INDEX "Alert_userEmail_status_idx" ON "Alert"("userEmail", "status");
CREATE INDEX "Alert_storeId_status_idx" ON "Alert"("storeId", "status");
CREATE UNIQUE INDEX "Alert_storeId_uniqueHash_key" ON "Alert"("storeId", "uniqueHash");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
