const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

// Registre financier complet d'un projet (commandes, avenants, risques, factures, recettes...)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId est requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const items = await prisma.budgetItem.findMany({
      where: { projectId },
      include: {
        subcontractor: { select: { id: true, name: true } },
        lot: { select: { id: true, code: true, name: true } },
        invoices: { select: { id: true, label: true, amount: true, status: true } },
        // Contrat deja genere/lie a cet achat, le cas echeant (voir routes/contracts.js) : permet
        // au frontend de proposer uniquement les achats non encore lies dans le selecteur du
        // generateur de contrats.
        contract: { select: { id: true, title: true } },
      },
      orderBy: { date: "desc" },
    });
    res.json(items);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      projectId,
      lotId,
      label,
      amount,
      type,
      category,
      date,
      entryType,
      status,
      subcontractorId,
      invoiceNumber,
      fileUrl,
      fileName,
      relatedEntryId,
    } = req.body;
    if (!projectId || !label || amount === undefined) {
      return res.status(400).json({ error: "projectId, label et amount sont requis" });
    }

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const item = await prisma.budgetItem.create({
      data: {
        projectId,
        lotId: lotId || null,
        label,
        amount: Number(amount),
        type: type || "expense",
        category,
        date: date ? new Date(date) : new Date(),
        entryType: entryType || "PURCHASE_ORDER",
        status: status || "ENGAGED",
        subcontractorId: subcontractorId || null,
        invoiceNumber: invoiceNumber || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        relatedEntryId: relatedEntryId || null,
      },
    });
    res.status(201).json(item);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.budgetItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Ligne budgetaire introuvable" });
    const project = await assertProjectAccess(req, item.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    const {
      label,
      amount,
      type,
      category,
      date,
      lotId,
      entryType,
      status,
      subcontractorId,
      invoiceNumber,
      fileUrl,
      fileName,
      relatedEntryId,
    } = req.body;
    const updated = await prisma.budgetItem.update({
      where: { id: req.params.id },
      data: {
        label,
        amount: amount !== undefined ? Number(amount) : undefined,
        type,
        category,
        date: date ? new Date(date) : undefined,
        lotId: lotId !== undefined ? lotId || null : undefined,
        entryType,
        status,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        invoiceNumber: invoiceNumber !== undefined ? invoiceNumber || null : undefined,
        fileUrl: fileUrl !== undefined ? fileUrl : undefined,
        fileName: fileName !== undefined ? fileName : undefined,
        relatedEntryId: relatedEntryId !== undefined ? relatedEntryId || null : undefined,
      },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const item = await prisma.budgetItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Ligne budgetaire introuvable" });
    const project = await assertProjectAccess(req, item.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    await prisma.budgetItem.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
