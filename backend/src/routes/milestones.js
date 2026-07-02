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
    const { projectId, name, date } = req.body;
    if (!projectId || !name || !date) return res.status(400).json({ error: "projectId, name et date sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const milestone = await prisma.milestone.create({
      data: { projectId, name, date: new Date(date) },
    });
    res.status(201).json(milestone);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!milestone) return res.status(404).json({ error: "Jalon introuvable" });
    const project = await assertProjectAccess(req, milestone.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    const { name, date, done } = req.body;
    const updated = await prisma.milestone.update({
      where: { id: req.params.id },
      data: { name, date: date ? new Date(date) : undefined, done },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const milestone = await prisma.milestone.findUnique({ where: { id: req.params.id } });
    if (!milestone) return res.status(404).json({ error: "Jalon introuvable" });
    const project = await assertProjectAccess(req, milestone.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    await prisma.milestone.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
