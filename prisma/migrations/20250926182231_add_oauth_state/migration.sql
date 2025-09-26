-- CreateTable
CREATE TABLE "public"."OAuthState" (
    "state" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("state")
);

-- CreateIndex
CREATE INDEX "OAuthState_shop_createdAt_idx" ON "public"."OAuthState"("shop", "createdAt");
