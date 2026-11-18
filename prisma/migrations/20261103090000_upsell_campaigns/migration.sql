-- Upsell campaigns: one offer table, four placements, view counts, and
-- personal next-order coupons. Additive only: every new column has a default
-- or is nullable, so existing offers keep working as checkout upsells.
ALTER TABLE "CheckoutUpsellOffer"
  ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'CHECKOUT',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN "views" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "couponValidDays" INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN "couponMinSpendCents" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "CheckoutUpsellOffer_placement_isActive_idx" ON "CheckoutUpsellOffer"("placement", "isActive");

ALTER TABLE "Coupon"
  ADD COLUMN "upsellOfferId" TEXT,
  ADD COLUMN "sourceOrderId" TEXT;
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_upsellOfferId_fkey" FOREIGN KEY ("upsellOfferId") REFERENCES "CheckoutUpsellOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Coupon_upsellOfferId_idx" ON "Coupon"("upsellOfferId");
CREATE INDEX "Coupon_sourceOrderId_idx" ON "Coupon"("sourceOrderId");
