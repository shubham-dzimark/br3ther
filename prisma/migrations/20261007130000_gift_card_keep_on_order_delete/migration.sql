-- DropForeignKey
ALTER TABLE "GiftCard" DROP CONSTRAINT "GiftCard_purchaseOrderId_fkey";

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

