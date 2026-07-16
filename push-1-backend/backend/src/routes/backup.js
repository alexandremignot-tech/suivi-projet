const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Ordre compatible avec les cles etrangeres (parents d'abord)
const TABLES = [
  "organization",
  "user",
  "subcontractor",
  "project",
  "projectMember",
  "lot",
  "column",
  "task",
  "milestone",
  "document",
  "equipment",
  "budgetItem",
  "progressStatement",
  "siteReport",
  "reportPhoto",
  "unitStepTemplate",
  "unit",
  "unitStep",
  "issue",
];

// Export complet de la base en JSON. ?files=1 pour inclure aussi les fichiers (plus lourd).
// La reponse est STREAMEE table par table et fichier par fichier : la memoire du serveur
// (512 Mo sur le plan gratuit Render) ne contient jamais plus d'un fichier a la fois.
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const includeFiles = req.query.files === "1";
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="sauvegarde-suivi-projet-${stamp}${includeFiles ? "-avec-fichiers" : ""}.json"`);

    res.write(`{"version":2,"exportedAt":${JSON.stringify(new Date().toISOString())},"tables":{`);
    let first = true;
    for (const t of TABLES) {
      const rows = await prisma[t].findMany();
      res.write(`${first ? "" : ","}${JSON.stringify(t)}:${JSON.stringify(rows)}`);
      first = false;
    }
    if (includeFiles) {
      res.write(',"storedFile":[');
      const metas = await prisma.storedFile.findMany({ select: { id: true }, orderBy: { createdAt: "asc" } });
      for (let i = 0; i < metas.length; i++) {
        const f = await prisma.storedFile.findUnique({ where: { id: metas[i].id } });
        const row = { ...f, data: Buffer.from(f.data).toString("base64") };
        res.write((i ? "," : "") + JSON.stringify(row));
      }
      res.write("]");
    }
    res.write("}}");
    res.end();
  })
);

// Restauration : recharge une sauvegarde JSON (ignore les enregistrements deja presents).
// A utiliser sur une base neuve (apres perte) ou pour completer une base existante.
router.post(
  "/restore",
  express.json({ limit: "400mb" }),
  asyncHandler(async (req, res) => {
    const dump = req.body;
    if (!dump || !dump.tables) return res.status(400).json({ error: "Sauvegarde invalide (tables manquantes)" });

    const report = {};

    // BudgetItem a une auto-reference (relatedEntryId) : on insere sans, puis on remet le lien.
    const budgetItems = dump.tables.budgetItem || [];
    const relatedLinks = budgetItems.filter((b) => b.relatedEntryId).map((b) => ({ id: b.id, relatedEntryId: b.relatedEntryId }));

    for (const t of TABLES) {
      let rows = dump.tables[t] || [];
      if (!rows.length) continue;
      if (t === "budgetItem") rows = rows.map((b) => ({ ...b, relatedEntryId: null }));
      const result = await prisma[t].createMany({ data: rows, skipDuplicates: true });
      report[t] = result.count;
    }

    for (const link of relatedLinks) {
      await prisma.budgetItem
        .update({ where: { id: link.id }, data: { relatedEntryId: link.relatedEntryId } })
        .catch(() => {});
    }

    if (dump.tables.storedFile) {
      let count = 0;
      for (const f of dump.tables.storedFile) {
        await prisma.storedFile
          .create({ data: { ...f, data: Buffer.from(f.data, "base64") } })
          .then(() => (count += 1))
          .catch(() => {}); // deja present
      }
      report.storedFile = count;
    }

    res.json({ ok: true, restored: report });
  })
);

module.exports = router;
