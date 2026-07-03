-- AlterTable
ALTER TABLE "BudgetItem" ADD COLUMN "lotId" TEXT;

-- CreateIndex
CREATE INDEX "BudgetItem_lotId_idx" ON "BudgetItem"("lotId");

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
