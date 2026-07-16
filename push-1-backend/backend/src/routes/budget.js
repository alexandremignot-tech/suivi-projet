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
      },
      orderBy: { date: "desc" },
    });
    res.json(items);
  })
);

// Demandes de BC en attente (brouillons commandes/avenants), tous projets de l'organisation
router.get(
  "/pending",
  asyncHandler(async (req, res) => {
    const items = await prisma.budgetItem.findMany({
      where: {
        status: "DRAFT",
        entryType: { in: ["PURCHASE_ORDER", "AMENDMENT"] },
        type: "expense",
        project: { organizationId: req.user.organizationId },
      },
      include: {
        project: { select: { id: true, name: true } },
        lot: { select: { id: true, code: true, name: true } },
        subcontractor: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
    });
    const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
    res.json({ items, approvalThreshold: org?.approvalThreshold ?? 10000, isAdmin: req.user.role === "ADMIN" });
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

    // Circuit d'approbation : au-dessus du seuil de l'organisation, une commande/avenant
    // en brouillon ne peut etre engagee que par un ADMIN (ou apres approbation).
    let approvalPatch = {};
    const isEngagement =
      status && status !== "DRAFT" && item.status === "DRAFT" && ["PURCHASE_ORDER", "AMENDMENT"].includes(item.entryType);
    if (isEngagement) {
      const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
      const threshold = org?.approvalThreshold ?? 10000;
      const finalAmount = amount !== undefined ? Number(amount) : item.amount;
      if (finalAmount > threshold && !item.approvedAt) {
        if (req.user.role !== "ADMIN") {
          return res.status(403).json({
            error: `Approbation requise : ce montant (${Math.round(finalAmount)} EUR) depasse le seuil de ${Math.round(threshold)} EUR. Un administrateur doit approuver la demande (page Achats).`,
          });
        }
        approvalPatch = { approvedByName: req.user.name || req.user.email, approvedAt: new Date() };
      }
    }

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
        ...approvalPatch,
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


// Approuve une demande de BC : trace l'approbateur et engage la ligne.
// Au-dessus du seuil, reserve aux ADMIN.
router.post(
  "/:id/approve",
  asyncHandler(async (req, res) => {
    const item = await prisma.budgetItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Ligne introuvable" });
    const project = await assertProjectAccess(req, item.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });
    if (item.status !== "DRAFT") return res.status(400).json({ error: "Cette ligne n'est plus en attente" });

    const org = await prisma.organization.findUnique({ where: { id: req.user.organizationId } });
    const threshold = org?.approvalThreshold ?? 10000;
    if (item.amount > threshold && req.user.role !== "ADMIN") {
      return res.status(403).json({ error: `Montant au-dessus du seuil (${Math.round(threshold)} EUR) : approbation reservee aux administrateurs.` });
    }
    const updated = await prisma.budgetItem.update({
      where: { id: item.id },
      data: { status: "ENGAGED", approvedByName: req.user.name || req.user.email, approvedAt: new Date() },
    });
    res.json(updated);
  })
);

// Rejette une demande : la ligne repart en brouillon annote (elle peut etre modifiee ou supprimee)
router.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const item = await prisma.budgetItem.findUnique({ where: { id: req.params.id } });
    if (!item) return res.status(404).json({ error: "Ligne introuvable" });
    const project = await assertProjectAccess(req, item.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });
    const updated = await prisma.budgetItem.update({
      where: { id: item.id },
      data: { category: [item.category, `REJETE par ${req.user.name || req.user.email}${req.body.reason ? " : " + req.body.reason : ""}`].filter(Boolean).join(" | ") },
    });
    res.json(updated);
  })
);

module.exports = router;
