-- CreateEnum
CREATE TYPE "LotPhase" AS ENUM ('RFP_RFQ', 'BID_ANALYSIS', 'CONTRACT', 'FOLLOW_UP', 'RECEPTION_DIU', 'DONE');

-- CreateEnum
CREATE TYPE "ProgressStatementStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VALIDATED', 'INVOICED');

-- CreateEnum
CREATE TYPE "SiteReportType" AS ENUM ('VISITE', 'REUNION_COORDINATION', 'REUNION_CHANTIER');

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "LotPhase" NOT NULL DEFAULT 'RFP_RFQ',
    "subcontractorId" TEXT,
    "contractAmount" DOUBLE PRECISION,
    "order" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressStatement" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "subcontractorId" TEXT,
    "number" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "ProgressStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "fileUrl" TEXT,
    "fileName" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgressStatement_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "lotId" TEXT;

-- AlterTable
ALTER TABLE "SiteReport" ADD COLUMN "lotId" TEXT;
ALTER TABLE "SiteReport" ADD COLUMN "type" "SiteReportType" NOT NULL DEFAULT 'VISITE';

-- CreateIndex
CREATE INDEX "Lot_projectId_idx" ON "Lot"("projectId");

-- CreateIndex
CREATE INDEX "Lot_subcontractorId_idx" ON "Lot"("subcontractorId");

-- CreateIndex
CREATE INDEX "ProgressStatement_lotId_idx" ON "ProgressStatement"("lotId");

-- CreateIndex
CREATE INDEX "ProgressStatement_subcontractorId_idx" ON "ProgressStatement"("subcontractorId");

-- CreateIndex
CREATE INDEX "Document_lotId_idx" ON "Document"("lotId");

-- CreateIndex
CREATE INDEX "SiteReport_lotId_idx" ON "SiteReport"("lotId");

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressStatement" ADD CONSTRAINT "ProgressStatement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressStatement" ADD CONSTRAINT "ProgressStatement_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
