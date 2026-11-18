-- CreateTable
CREATE TABLE "CartFollowUp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "couponCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CartFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartFollowUpSend" (
    "id" TEXT NOT NULL,
    "followUpId" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clickedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "revenueCents" INTEGER,

    CONSTRAINT "CartFollowUpSend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CartFollowUp_enabled_delayMinutes_idx" ON "CartFollowUp"("enabled", "delayMinutes");

-- CreateIndex
CREATE INDEX "CartFollowUpSend_sentAt_idx" ON "CartFollowUpSend"("sentAt");

-- CreateIndex
CREATE INDEX "CartFollowUpSend_cartId_idx" ON "CartFollowUpSend"("cartId");

-- CreateIndex
CREATE UNIQUE INDEX "CartFollowUpSend_followUpId_cartId_key" ON "CartFollowUpSend"("followUpId", "cartId");

-- AddForeignKey
ALTER TABLE "CartFollowUpSend" ADD CONSTRAINT "CartFollowUpSend_followUpId_fkey" FOREIGN KEY ("followUpId") REFERENCES "CartFollowUp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartFollowUpSend" ADD CONSTRAINT "CartFollowUpSend_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;
