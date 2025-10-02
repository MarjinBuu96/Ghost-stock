-- CreateTable
CREATE TABLE "public"."PartnerApplication" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "agency" TEXT,
    "website" TEXT,
    "verticals" TEXT,
    "volume" TEXT,
    "notes" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerApplication_email_createdAt_idx" ON "public"."PartnerApplication"("email", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerApplication_status_createdAt_idx" ON "public"."PartnerApplication"("status", "createdAt");
