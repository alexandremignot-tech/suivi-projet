-- Lien Contract <-> BudgetItem (achat) : 1 contrat = 1 achat au plus, + fichier source conserve
ALTER TABLE "Contract" ADD COLUMN "budgetItemId" TEXT;
ALTER TABLE "Contract" ADD COLUMN "sourceFileUrl" TEXT;
ALTER TABLE "Contract" ADD COLUMN "sourceFileName" TEXT;

CREATE UNIQUE INDEX "Contract_budgetItemId_key" ON "Contract"("budgetItemId");

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_budgetItemId_fkey"
  FOREIGN KEY ("budgetItemId") REFERENCES "BudgetItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
