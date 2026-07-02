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
    const { projectId, label, amount, type, category, date } = req.body;
    if (!projectId || !label || amount === undefined) {
      return res.status(400).json({ error: "projectId, label et amount sont requis" });
    }

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const item = await prisma.budgetItem.create({
      data: {
        projectId,
        label,
        amount: Number(amount),
        type: type || "expense",
        category,
        date: date ? new Date(date) : new Date(),
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

    const { label, amount, type, category, date } = req.body;
    const updated = await prisma.budgetItem.update({
      where: { id: req.params.id },
      data: {
        label,
        amount: amount !== undefined ? Number(amount) : undefined,
        type,
        category,
        date: date ? new Date(date) : undefined,
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
