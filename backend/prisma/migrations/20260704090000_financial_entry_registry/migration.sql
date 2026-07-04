-- CreateEnum
CREATE TYPE "FinancialEntryType" AS ENUM ('PURCHASE_ORDER', 'AMENDMENT', 'RISK', 'INVOICE', 'CONTRACT', 'SUBSIDY', 'OTHER');

-- CreateEnum
CREATE TYPE "FinancialEntryStatus" AS ENUM ('DRAFT', 'ENGAGED', 'SUBMITTED', 'VALIDATED', 'PAID');

-- AlterTable
ALTER TABLE "BudgetItem" ADD COLUMN "entryType" "FinancialEntryType" NOT NULL DEFAULT 'PURCHASE_ORDER';
ALTER TABLE "BudgetItem" ADD COLUMN "status" "FinancialEntryStatus" NOT NULL DEFAULT 'ENGAGED';
ALTER TABLE "BudgetItem" ADD COLUMN "subcontractorId" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "fileUrl" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "fileName" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "relatedEntryId" TEXT;

-- CreateIndex
CREATE INDEX "BudgetItem_subcontractorId_idx" ON "BudgetItem"("subcontractorId");

-- CreateIndex
CREATE INDEX "BudgetItem_relatedEntryId_idx" ON "BudgetItem"("relatedEntryId");

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetItem" ADD CONSTRAINT "BudgetItem_relatedEntryId_fkey" FOREIGN KEY ("relatedEntryId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
