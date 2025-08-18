-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userEmail" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "systemQty" INTEGER NOT NULL,
    "expectedMin" INTEGER NOT NULL,
    "expectedMax" INTEGER NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "Alert_userEmail_status_idx" ON "Alert"("userEmail", "status");
