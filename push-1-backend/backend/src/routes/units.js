const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertLotAccess(req, lotId) {
  const lot = await prisma.lot.findUnique({ where: { id: lotId }, include: { project: true } });
  if (!lot) return null;
  if (lot.project.organizationId !== req.user.organizationId) return null;
  return lot;
}

// Nettoie une liste de specs {label, value} envoyee par le formulaire (fiche technique d'une
// unite ou d'un equipement) : retire les lignes totalement vides.
function cleanSpecs(specs) {
  if (!Array.isArray(specs)) return undefined;
  const filtered = specs
    .map((s) => ({ label: (s?.label || "").trim(), value: (s?.value || "").trim() }))
    .filter((s) => s.label || s.value);
  return filtered.length > 0 ? filtered : null;
}

// --- Etapes type (checklist repetable definie une fois par lot) ---

// Cree une etape type et l'applique retroactivement a toutes les unites existantes du lot
router.post(
  "/unit-templates",
  asyncHandler(async (req, res) => {
    const { lotId, name, category, defaultSubcontractorId } = req.body;
    if (!lotId || !name) return res.status(400).json({ error: "lotId et name sont requis" });

    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });

    const count = await prisma.unitStepTemplate.count({ where: { lotId } });
    const template = await prisma.unitStepTemplate.create({
      data: { lotId, name, category: category || null, order: count, defaultSubcontractorId: defaultSubcontractorId || null },
    });

    const units = await prisma.unit.findMany({ where: { lotId } });
    if (units.length > 0) {
      await prisma.unitStep.createMany({
        data: units.map((u) => ({
          unitId: u.id,
          templateId: template.id,
          subcontractorId: defaultSubcontractorId || null,
        })),
      });
    }

    res.status(201).json(template);
  })
);

router.put(
  "/unit-templates/:id",
  asyncHandler(async (req, res) => {
    const template = await prisma.unitStepTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Etape type introuvable" });
    const lot = await assertLotAccess(req, template.lotId);
    if (!lot) return res.status(403).json({ error: "Acces refuse" });

    const { name, category, order, defaultSubcontractorId } = req.body;
    const updated = await prisma.unitStepTemplate.update({
      where: { id: req.params.id },
      data: {
        name,
        category: category !== undefined ? category || null : undefined,
        order,
        defaultSubcontractorId: defaultSubcontractorId !== undefined ? defaultSubcontractorId || null : undefined,
      },
    });
    res.json(updated);
  })
);

router.delete(
  "/unit-templates/:id",
  asyncHandler(async (req, res) => {
    const template = await prisma.unitStepTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ error: "Etape type introuvable" });
    const lot = await assertLotAccess(req, template.lotId);
    if (!lot) return res.status(403).json({ error: "Acces refuse" });

    await prisma.unitStepTemplate.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// --- Unites (maisons / points de livraison) ---

router.post(
  "/units",
  asyncHandler(async (req, res) => {
    const { lotId, name, notes, specs } = req.body;
    if (!lotId || !name) return res.status(400).json({ error: "lotId et name sont requis" });

    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });

    const unit = await createUnitWithSteps(lotId, name, notes, specs);
    res.status(201).json(unit);
  })
);

// Creation en masse : ex. prefix "Lot ", from 53, to 90 -> "Lot 53" a "Lot 90"
router.post(
  "/units/bulk",
  asyncHandler(async (req, res) => {
    const { lotId, prefix, from, to } = req.body;
    if (!lotId || from === undefined || to === undefined) {
      return res.status(400).json({ error: "lotId, from et to sont requis" });
    }

    const lot = await assertLotAccess(req, lotId);
    if (!lot) return res.status(404).json({ error: "Lot introuvable" });

    const start = Number(from);
    const end = Number(to);
    if (end < start || end - start > 500) {
      return res.status(400).json({ error: "Plage invalide (max 500 unites a la fois)" });
    }

    const created = [];
    for (let i = start; i <= end; i++) {
      const unit = await createUnitWithSteps(lotId, `${prefix || "Lot "}${i}`);
      created.push(unit);
    }
    res.status(201).json({ count: created.length, units: created });
  })
);

async function createUnitWithSteps(lotId, name, notes, specs) {
  const unit = await prisma.unit.create({ data: { lotId, name, notes, specs: cleanSpecs(specs) ?? undefined } });
  const templates = await prisma.unitStepTemplate.findMany({ where: { lotId } });
  if (templates.length > 0) {
    await prisma.unitStep.createMany({
      data: templates.map((t) => ({ unitId: unit.id, templateId: t.id, subcontractorId: t.defaultSubcontractorId })),
    });
  }
  return unit;
}

router.put(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({ where: { id: req.params.id } });
    if (!unit) return res.status(404).json({ error: "Unite introuvable" });
    const lot = await assertLotAccess(req, unit.lotId);
    if (!lot) return res.status(403).json({ error: "Acces refuse" });

    const { name, notes, specs } = req.body;
    const updated = await prisma.unit.update({
      where: { id: req.params.id },
      data: { name, notes, specs: specs !== undefined ? cleanSpecs(specs) : undefined },
    });
    res.json(updated);
  })
);

router.delete(
  "/units/:id",
  asyncHandler(async (req, res) => {
    const unit = await prisma.unit.findUnique({ where: { id: req.params.id } });
    if (!unit) return res.status(404).json({ error: "Unite introuvable" });
    const lot = await assertLotAccess(req, unit.lotId);
    if (!lot) return res.status(403).json({ error: "Acces refuse" });

    await prisma.unit.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// --- Cases de la grille (statut d'une unite sur une etape) ---

router.patch(
  "/unit-steps/:id",
  asyncHandler(async (req, res) => {
    const step = await prisma.unitStep.findUnique({ where: { id: req.params.id }, include: { unit: true } });
    if (!step) return res.status(404).json({ error: "Case introuvable" });
    const lot = await assertLotAccess(req, step.unit.lotId);
    if (!lot) return res.status(403).json({ error: "Acces refuse" });

    const { status, subcontractorId, date, comment } = req.body;
    const updated = await prisma.unitStep.update({
      where: { id: req.params.id },
      data: {
        status,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        date: date !== undefined ? (date ? new Date(date) : null) : undefined,
        comment,
      },
    });
    res.json(updated);
  })
);

module.exports = router;
