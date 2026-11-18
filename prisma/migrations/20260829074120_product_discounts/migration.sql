-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "discountActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "discountEndsAt" TIMESTAMP(3),
ADD COLUMN     "discountPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountStartsAt" TIMESTAMP(3),
ADD COLUMN     "discountTitle" TEXT;
