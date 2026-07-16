const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Verifie que la colonne appartient a un projet de l'organisation de l'utilisateur
async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, name } = req.body;
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const count = await prisma.column.count({ where: { projectId } });
    const column = await prisma.column.create({ data: { projectId, name, order: count } });
    res.status(201).json(column);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const column = await prisma.column.findUnique({ where: { id: req.params.id } });
    if (!column) return res.status(404).json({ error: "Colonne introuvable" });
    const project = await assertProjectAccess(req, column.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    const { name, order } = req.body;
    const updated = await prisma.column.update({
      where: { id: req.params.id },
      data: { name, order },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const column = await prisma.column.findUnique({ where: { id: req.params.id } });
    if (!column) return res.status(404).json({ error: "Colonne introuvable" });
    const project = await assertProjectAccess(req, column.projectId);
    if (!project) return res.status(403).json({ error: "Acces refuse" });

    await prisma.column.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
