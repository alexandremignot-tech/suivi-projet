-- Champs legaux de l'annuaire sous-traitants, necessaires au generateur de contrats :
-- numero d'entreprise (BCE/TVA), siege social, representant legal.
ALTER TABLE "Subcontractor" ADD COLUMN "vatNumber" TEXT;
ALTER TABLE "Subcontractor" ADD COLUMN "address" TEXT;
ALTER TABLE "Subcontractor" ADD COLUMN "representative" TEXT;
