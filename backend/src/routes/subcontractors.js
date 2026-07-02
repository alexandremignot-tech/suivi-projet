const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Annuaire des sous-traitants de l'organisation (utilisable sur tous les projets)
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const subcontractors = await prisma.subcontractor.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { name: "asc" },
    });
    res.json(subcontractors);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, specialty, contactName, email, phone } = req.body;
    if (!name) return res.status(400).json({ error: "Le nom du sous-traitant est requis" });

    const subcontractor = await prisma.subcontractor.create({
      data: { name, specialty, contactName, email, phone, organizationId: req.user.organizationId },
    });
    res.status(201).json(subcontractor);
  })
);

async function loadOrFail(req, res) {
  const sub = await prisma.subcontractor.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!sub) {
    res.status(404).json({ error: "Sous-traitant introuvable" });
    return null;
  }
  return sub;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOrFail(req, res);
    if (!existing) return;

    const { name, specialty, contactName, email, phone } = req.body;
    const updated = await prisma.subcontractor.update({
      where: { id: req.params.id },
      data: { name, specialty, contactName, email, phone },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadOrFail(req, res);
    if (!existing) return;

    await prisma.subcontractor.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
