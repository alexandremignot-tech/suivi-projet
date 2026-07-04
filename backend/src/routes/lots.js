const express = require("express");
const path = require("path");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { buildDiuData } = require("../utils/diu");
const { buildDiuPdf } = require("../utils/diuPdf");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const router = express.Router();
router.use(requireAuth);

// Charge toutes les donnees necessaires au DIU d'un lot
async function loadDiu(req) {
  const lot = await prisma.lot.findUnique({
    where: { id: req.params.id },
    include: { subcontractor: true, units: { orderBy: { name: "asc" } } },
  });
  if (!lot) return null;
  const project = await prisma.project.findFirst({
    where: { id: lot.projectId, organizationId: req.user.organizationId },
  });
  if (!project) return null;
  const [documents, equipments] = await Promise.all([
    prisma.document.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);
  return buildDiuData({ lot, project, documents, equipments, units: lot.units });
}

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

// Structure complete du DIU du lot (sections, checklist, inventaires) — pour la page DIU du frontend
router.get(
  "/:id/diu",
  asyncHandler(async (req, res) => {
    const diu = await loadDiu(req);
    if (!diu) return res.status(404).json({ error: "Lot introuvable" });
    res.json(diu);
  })
);

// DIU assemble en un seul PDF : page de garde + mentions legales + checklist + inventaires
// + sommaire + fusion de tous les documents PDF joints au lot.
router.get(
  "/:id/diu.pdf",
  asyncHandler(async (req, res) => {
    const diu = await loadDiu(req);
    if (!diu) return res.status(404).json({ error: "Lot introuvable" });
    const { bytes, merged, failures, attachments } = await buildDiuPdf(diu, UPLOAD_DIR);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="DIU-${diu.lot.code}-${diu.project.name.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`
    );
    res.setHeader("X-Diu-Merged", String(merged));
    res.setHeader("X-Diu-Failures", String(failures));
    res.setHeader("X-Diu-Attachments", String(attachments));
    res.send(Buffer.from(bytes));
  })
);

module.exports = router;
