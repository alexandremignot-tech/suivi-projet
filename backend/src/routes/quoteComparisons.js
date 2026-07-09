const express = require("express");
const multer = require("multer");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { extractQuoteLineItems } = require("../utils/quoteExtraction");

const router = express.Router();
router.use(requireAuth);

// Fichier de devis garde en memoire le temps de l'extraction seulement (jamais ecrit sur disque ni
// stocke en base) : voir utils/quoteExtraction.js. Limite raisonnable pour un devis PDF/scan.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Criteres par defaut d'une nouvelle comparaison (poids en %, modifiables librement ensuite).
const DEFAULT_CRITERIA = [
  { key: "price", label: "Prix", weight: 30, info: "Base sur le total chiffre du tableau" },
  { key: "delai", label: "Delai", weight: 15, info: "Rapidite de livraison/execution annoncee" },
  { key: "garantie", label: "Garantie", weight: 15, info: "Duree de garantie sur pieces" },
  { key: "fiabilite", label: "Fiabilite / references", weight: 15, info: "Historique et reputation du fournisseur" },
  { key: "perimetre", label: "Conformite perimetre", weight: 10, info: "Tous les postes demandes sont-ils couverts" },
  { key: "refs", label: "References locales", weight: 10, info: "Chantiers similaires deja realises" },
  { key: "coord", label: "Facilite de coordination", weight: 5, info: "Reactivite, interlocuteur unique, disponibilite" },
];

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

async function loadWithAccess(req, res) {
  const comparison = await prisma.quoteComparison.findUnique({ where: { id: req.params.id } });
  if (!comparison) {
    res.status(404).json({ error: "Comparaison introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, comparison.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return comparison;
}

// Revalide la forme des sous-structures JSON avant ecriture : jamais de confiance aveugle dans ce
// qu'envoie le frontend (memes precautions que pour Contract.data / MeetingMinutes.observations).
function sanitizeCriteria(criteria) {
  if (!Array.isArray(criteria)) return DEFAULT_CRITERIA;
  return criteria
    .filter((c) => c && c.key && c.label)
    .map((c) => ({
      key: String(c.key),
      label: String(c.label),
      weight: Number.isFinite(Number(c.weight)) ? Number(c.weight) : 0,
      info: c.info ? String(c.info) : "",
    }));
}

function sanitizeOffers(offers) {
  if (!Array.isArray(offers)) return [];
  return offers.map((o) => ({
    id: o.id || uid(),
    name: String(o.name || "Offre sans nom"),
    subcontractorId: o.subcontractorId || null,
    validityDays: Number.isFinite(Number(o.validityDays)) ? Number(o.validityDays) : null,
    deliveryWeeks: Number.isFinite(Number(o.deliveryWeeks)) ? Number(o.deliveryWeeks) : null,
    warrantyMonths: Number.isFinite(Number(o.warrantyMonths)) ? Number(o.warrantyMonths) : null,
    scores: o.scores && typeof o.scores === "object" ? o.scores : {},
    sourceFileName: o.sourceFileName ? String(o.sourceFileName) : null,
  }));
}

function sanitizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems.map((li) => ({
    id: li.id || uid(),
    label: String(li.label || ""),
    budgetAmount: Number.isFinite(Number(li.budgetAmount)) ? Number(li.budgetAmount) : null,
    prices:
      li.prices && typeof li.prices === "object"
        ? Object.fromEntries(
            Object.entries(li.prices).map(([offerId, p]) => [
              offerId,
              {
                amount: p && Number.isFinite(Number(p.amount)) ? Number(p.amount) : null,
                note: p && p.note ? String(p.note) : "",
                included: p ? p.included !== false : true,
              },
            ])
          )
        : {},
  }));
}

// Liste des comparaisons d'un projet
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const list = await prisma.quoteComparison.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { lot: { select: { id: true, code: true, name: true } } },
    });
    res.json(list);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, lotId, title } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: "projectId et title sont requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const comparison = await prisma.quoteComparison.create({
      data: {
        projectId,
        lotId: lotId || null,
        title,
        criteria: DEFAULT_CRITERIA,
        offers: [],
        lineItems: [],
      },
    });
    res.status(201).json(comparison);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { title, lotId, criteria, offers, lineItems } = req.body;
    const updated = await prisma.quoteComparison.update({
      where: { id: req.params.id },
      data: {
        title: title !== undefined ? title : undefined,
        lotId: lotId !== undefined ? lotId || null : undefined,
        criteria: criteria !== undefined ? sanitizeCriteria(criteria) : undefined,
        offers: offers !== undefined ? sanitizeOffers(offers) : undefined,
        lineItems: lineItems !== undefined ? sanitizeLineItems(lineItems) : undefined,
      },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;
    await prisma.quoteComparison.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// Extraction assistee par IA d'un devis (PDF/image/texte/CSV) : ne touche pas la base, renvoie
// juste un resultat structure que le frontend propose de fusionner dans la comparaison en cours.
router.post(
  "/:id/extract",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;
    if (!req.file) return res.status(400).json({ error: "Aucun fichier recu (champ 'file' attendu)" });

    try {
      const result = await extractQuoteLineItems({
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        filename: req.file.originalname,
      });
      res.json({ ...result, sourceFileName: req.file.originalname });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message || "Erreur lors de l'extraction" });
    }
  })
);

module.exports = router;
module.exports.DEFAULT_CRITERIA = DEFAULT_CRITERIA;
