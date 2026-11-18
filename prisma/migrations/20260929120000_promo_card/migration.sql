-- Editorial picture cards for the home page ("Custom categories" row).
CREATE TABLE "PromoCard" (
    "id" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "alt" TEXT NOT NULL DEFAULT '',
    "eyebrow" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "subtitle" TEXT NOT NULL DEFAULT '',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "ctaHref" TEXT NOT NULL DEFAULT '',
    "panelColour" TEXT NOT NULL DEFAULT '#EAF7D9',
    "panelPosition" TEXT NOT NULL DEFAULT 'bottom',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PromoCard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PromoCard_isActive_sortOrder_idx" ON "PromoCard"("isActive", "sortOrder");
