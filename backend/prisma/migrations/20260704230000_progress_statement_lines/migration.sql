-- Ajoute le detail par poste aux etats d'avancement (EA detailles type "Suivi EA Sparx") :
-- lines = tableau JSON [{description, qty, unit, unitPrice, total, prevPct, cumulPct}]
-- Le montant de la periode reste dans "amount" (= somme des (cumulPct - prevPct) * total).
ALTER TABLE "ProgressStatement" ADD COLUMN "lines" JSONB;
