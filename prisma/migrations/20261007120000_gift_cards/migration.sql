-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('PENDING', 'ACTIVE', 'VOID');

-- CreateEnum
CREATE TYPE "GiftCardDelivery" AS ENUM ('RECIPIENT', 'BUYER');

-- CreateEnum
CREATE TYPE "GiftCardTxKind" AS ENUM ('ISSUE', 'REDEEM', 'RESTORE', 'VOID', 'ADJUST');

-- AlterEnum
ALTER TYPE "ProductType" ADD VALUE 'GIFT_CARD';

-- AlterTable
ALTER TABLE "CartItem" ADD COLUMN     "giftCardDetails" JSONB;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "giftCardCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftCardRedeemedCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "giftCardRedeemedId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "giftCardDetails" JSONB,
ADD COLUMN     "isGiftCard" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'PENDING',
    "purchaseOrderId" TEXT,
    "purchaseOrderItemId" TEXT,
    "buyerEmail" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "message" TEXT,
    "deliverTo" "GiftCardDelivery" NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "emailedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardTransaction" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "kind" "GiftCardTxKind" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "orderId" TEXT,
    "adminId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_purchaseOrderItemId_key" ON "GiftCard"("purchaseOrderItemId");

-- CreateIndex
CREATE INDEX "GiftCard_purchaseOrderId_idx" ON "GiftCard"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "GiftCard_status_createdAt_idx" ON "GiftCard"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GiftCardTransaction_giftCardId_createdAt_idx" ON "GiftCardTransaction"("giftCardId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardTransaction_giftCardId_kind_orderId_key" ON "GiftCardTransaction"("giftCardId", "kind", "orderId");

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardTransaction" ADD CONSTRAINT "GiftCardTransaction_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

