const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Verifie que le lot appartient a l'organisation (via son projet)
async function assertLotAccess(req, lotId) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, include: { project: true } });
  if (!lot || lot.project.organizationId !== req.user.organizationId) return null;
  return lot;
}

async function loadOffer(req, res) {
  const offer = await prisma.offer.findUnique({ where: { id: req.params.id }, include: { lot: { include: { project: true } } } });
  if (!offer || offer.lot.project.organizationId !== req.user.organizationId) {
    res.status(404).json({ error: "Offre introuvable" });
    return null;
  }
  return offer;
}

// Offres d'un lot
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { lotId } = req.query;
    if (!lotId) return res.status(400).json({ error: "lotId est requis" });
    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });
    const offers = await prisma.offer.findMany({
      where: { lotId },
      include: { subcontractor: { select: { id: true, name: true } } },
      orderBy: { amount: "asc" },
    });
    res.json(offers);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { lotId, supplierName, subcontractorId, amount, delayWeeks, score, notes, fileUrl, fileName } = req.body;
    if (!lotId || !supplierName || amount === undefined) {
      return res.status(400).json({ error: "lotId, supplierName et amount sont requis" });
    }
    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });
    const offer = await prisma.offer.create({
      data: {
        lotId,
        supplierName,
        subcontractorId: subcontractorId || null,
        amount: Number(amount),
        delayWeeks: delayWeeks !== undefined && delayWeeks !== "" ? Number(delayWeeks) : null,
        score: score !== undefined && score !== "" ? Number(score) : null,
        notes,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
      },
    });
    res.status(201).json(offer);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOffer(req, res);
    if (!existing) return;
    const { supplierName, subcontractorId, amount, delayWeeks, score, notes, status, fileUrl, fileName } = req.body;
    const offer = await prisma.offer.update({
      where: { id: existing.id },
      data: {
        supplierName,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        amount: amount !== undefined ? Number(amount) : undefined,
        delayWeeks: delayWeeks !== undefined ? (delayWeeks === "" || delayWeeks === null ? null : Number(delayWeeks)) : undefined,
        score: score !== undefined ? (score === "" || score === null ? null : Number(score)) : undefined,
        notes,
        status,
        fileUrl,
        fileName,
      },
    });
    res.json(offer);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOffer(req, res);
    if (!existing) return;
    await prisma.offer.delete({ where: { id: existing.id } });
    res.status(204).end();
  })
);

// Retenir une offre : la marque RETENUE (les autres RECUE -> REJETEE optionnellement cote UI)
// et cree la DEMANDE de bon de commande (BudgetItem PURCHASE_ORDER en brouillon) liee.
// La demande devra etre approuvee selon le seuil de l'organisation avant engagement.
router.post(
  "/:id/retain",
  asyncHandler(async (req, res) => {
    const offer = await loadOffer(req, res);
    if (!offer) return;
    if (offer.budgetItemId) return res.status(400).json({ error: "Cette offre a deja genere une demande de BC" });

    const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
    const offersCount = await prisma.offer.count({ where: { lotId: offer.lotId } });
    const warnings = [];
    if (offer.amount > (org?.approvalThreshold ?? 10000) && offersCount < 3) {
      warnings.push(`Seulement ${offersCount} offre(s) recue(s) pour un montant au-dessus du seuil : la regle des 3 offres n'est pas respectee.`);
    }

    const item = await prisma.budgetItem.create({
      data: {
        projectId: offer.lot.projectId,
        lotId: offer.lotId,
        subcontractorId: offer.subcontractorId || null,
        label: `BC ${offer.supplierName} — ${offer.lot.name}`,
        amount: offer.amount,
        type: "expense",
        entryType: "PURCHASE_ORDER",
        status: "DRAFT",
        date: new Date(),
        fileUrl: offer.fileUrl,
        fileName: offer.fileName,
        requestedByName: req.user.name || req.user.email || null,
      },
    });
    const updated = await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "RETENUE", budgetItemId: item.id },
    });
    res.status(201).json({ offer: updated, budgetItem: item, warnings });
  })
);

module.exports = router;
