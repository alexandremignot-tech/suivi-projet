-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN "lotId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Equipment" ADD COLUMN "location" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "specs" JSONB;

-- CreateIndex
CREATE INDEX "Equipment_lotId_idx" ON "Equipment"("lotId");

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
