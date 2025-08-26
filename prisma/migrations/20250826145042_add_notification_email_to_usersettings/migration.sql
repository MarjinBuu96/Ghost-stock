-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userEmail" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "stripeCustomerId" TEXT,
    "slackWebhookUrl" TEXT,
    "notificationEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserSettings" ("createdAt", "currency", "id", "notificationEmail", "plan", "slackWebhookUrl", "stripeCustomerId", "updatedAt", "userEmail") SELECT "createdAt", "currency", "id", "notificationEmail", "plan", "slackWebhookUrl", "stripeCustomerId", "updatedAt", "userEmail" FROM "UserSettings";
DROP TABLE "UserSettings";
ALTER TABLE "new_UserSettings" RENAME TO "UserSettings";
CREATE UNIQUE INDEX "UserSettings_userEmail_key" ON "UserSettings"("userEmail");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
