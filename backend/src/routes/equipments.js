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
    const {
      projectId,
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      technicalSheetUrl,
      technicalSheetFileName,
      maintenanceIntervalDays,
      lastMaintenanceDate,
      notes,
    } = req.body;

    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const equipment = await prisma.equipment.create({
      data: {
        projectId,
        name,
        category,
        manufacturer,
        model,
        serialNumber,
        technicalSheetUrl,
        technicalSheetFileName,
        maintenanceIntervalDays: maintenanceIntervalDays ? Number(maintenanceIntervalDays) : null,
        lastMaintenanceDate: lastMaintenanceDate ? new Date(lastMaintenanceDate) : null,
        notes,
      },
    });
    res.status(201).json(equipment);
  })
);

async function loadWithAccess(req, res) {
  const equipment = await prisma.equipment.findUnique({ where: { id: req.params.id } });
  if (!equipment) {
    res.status(404).json({ error: "Equipement introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, equipment.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return equipment;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const {
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      technicalSheetUrl,
      technicalSheetFileName,
      maintenanceIntervalDays,
      lastMaintenanceDate,
      notes,
    } = req.body;

    const updated = await prisma.equipment.update({
      where: { id: req.params.id },
      data: {
        name,
        category,
        manufacturer,
        model,
        serialNumber,
        technicalSheetUrl: technicalSheetUrl !== undefined ? technicalSheetUrl : undefined,
        technicalSheetFileName: technicalSheetFileName !== undefined ? technicalSheetFileName : undefined,
        maintenanceIntervalDays:
          maintenanceIntervalDays !== undefined ? Number(maintenanceIntervalDays) || null : undefined,
        lastMaintenanceDate:
          lastMaintenanceDate !== undefined ? (lastMaintenanceDate ? new Date(lastMaintenanceDate) : null) : undefined,
        notes,
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

    await prisma.equipment.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
