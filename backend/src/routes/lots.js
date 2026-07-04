const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, code, name, subcontractorId, contractAmount, notes } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const count = await prisma.lot.count({ where: { projectId } });
    const lot = await prisma.lot.create({
      data: {
        projectId,
        code: code || `BB${count + 1}`,
        name,
        subcontractorId: subcontractorId || null,
        contractAmount: contractAmount ? Number(contractAmount) : null,
        notes,
        order: count,
      },
    });
    res.status(201).json(lot);
  })
);

async function loadWithAccess(req, res) {
  const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
  if (!lot) {
    res.status(404).json({ error: "Lot introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, lot.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return lot;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { code, name, phase, subcontractorId, contractAmount, notes, order } = req.body;
    const updated = await prisma.lot.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        phase,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        contractAmount: contractAmount !== undefined ? Number(contractAmount) || null : undefined,
        notes,
        order,
      },
    });
    res.json(updated);
  })
);

// Changement rapide de phase (glisser-deposer dans la vue Lots)
router.patch(
  "/:id/phase",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { phase } = req.body;
    const updated = await prisma.lot.update({ where: { id: req.params.id }, data: { phase } });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    await prisma.lot.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
