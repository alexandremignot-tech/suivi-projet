-- Module Achats : comparatif d'offres par lot + circuit d'approbation par seuil.
-- 1) Offres recues (appel d'offres / bid analysis)
CREATE TYPE "OfferStatus" AS ENUM ('RECUE', 'RETENUE', 'REJETEE');

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "subcontractorId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "delayWeeks" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'RECUE',
    "fileUrl" TEXT,
    "fileName" TEXT,
    "budgetItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Offer_lotId_idx" ON "Offer"("lotId");
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_budgetItemId_fkey" FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Tracabilite d'approbation sur les lignes du registre
ALTER TABLE "BudgetItem" ADD COLUMN "requestedByName" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "approvedByName" TEXT;
ALTER TABLE "BudgetItem" ADD COLUMN "approvedAt" TIMESTAMP(3);

-- 3) Seuil d'approbation de l'organisation (au-dela : approbation ADMIN obligatoire)
ALTER TABLE "Organization" ADD COLUMN "approvalThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10000;
