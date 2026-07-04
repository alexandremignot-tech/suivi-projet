const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

// Nettoie la liste de specs envoyee par le formulaire (tableau de {label, value}) : on retire
// les lignes vides pour ne pas polluer la fiche technique avec des paires label/value blanches.
function cleanSpecs(specs) {
  if (!Array.isArray(specs)) return undefined;
  const filtered = specs
    .map((s) => ({ label: (s?.label || "").trim(), value: (s?.value || "").trim() }))
    .filter((s) => s.label || s.value);
  return filtered.length > 0 ? filtered : null;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      projectId,
      lotId,
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      quantity,
      location,
      technicalSheetUrl,
      technicalSheetFileName,
      specs,
      maintenanceIntervalDays,
      lastMaintenanceDate,
      notes,
    } = req.body;

    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    if (lotId) {
      const lot = await prisma.lot.findFirst({ where: { id: lotId, projectId } });
      if (!lot) return res.status(400).json({ error: "Lot introuvable pour ce projet" });
    }

    const equipment = await prisma.equipment.create({
      data: {
        projectId,
        lotId: lotId || null,
        name,
        category,
        manufacturer,
        model,
        serialNumber,
        quantity: quantity ? Number(quantity) || 1 : 1,
        location,
        technicalSheetUrl,
        technicalSheetFileName,
        specs: cleanSpecs(specs) ?? undefined,
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
      lotId,
      name,
      category,
      manufacturer,
      model,
      serialNumber,
      quantity,
      location,
      technicalSheetUrl,
      technicalSheetFileName,
      specs,
      maintenanceIntervalDays,
      lastMaintenanceDate,
      notes,
    } = req.body;

    if (lotId) {
      const lot = await prisma.lot.findFirst({ where: { id: lotId, projectId: existing.projectId } });
      if (!lot) return res.status(400).json({ error: "Lot introuvable pour ce projet" });
    }

    const updated = await prisma.equipment.update({
      where: { id: req.params.id },
      data: {
        lotId: lotId !== undefined ? lotId || null : undefined,
        name,
        category,
        manufacturer,
        model,
        serialNumber,
        quantity: quantity !== undefined ? Number(quantity) || 1 : undefined,
        location: location !== undefined ? location : undefined,
        technicalSheetUrl: technicalSheetUrl !== undefined ? technicalSheetUrl : undefined,
        technicalSheetFileName: technicalSheetFileName !== undefined ? technicalSheetFileName : undefined,
        specs: specs !== undefined ? cleanSpecs(specs) : undefined,
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
