const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { generateSiteReportSummary } = require("../utils/aiReport");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

// Cree un rapport de chantier, avec ses photos, et genere immediatement le resume (IA si disponible)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, title, date, notes, criticalPoints, photos } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: "projectId et title sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const reportDate = date ? new Date(date) : new Date();
    const photoList = Array.isArray(photos) ? photos : [];

    const aiSummary = await generateSiteReportSummary({
      title,
      date: reportDate,
      notes,
      criticalPoints,
      photoCaptions: photoList.map((p) => p.caption),
    });

    const report = await prisma.siteReport.create({
      data: {
        projectId,
        title,
        date: reportDate,
        notes,
        criticalPoints,
        aiSummary,
        authorId: req.user.id,
        photos: {
          create: photoList.map((p) => ({ url: p.url, fileName: p.fileName, caption: p.caption })),
        },
      },
      include: { photos: true, author: { select: { id: true, name: true } } },
    });

    res.status(201).json(report);
  })
);

async function loadWithAccess(req, res) {
  const report = await prisma.siteReport.findUnique({ where: { id: req.params.id } });
  if (!report) {
    res.status(404).json({ error: "Rapport introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, report.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return report;
}

// Regenere le resume (utile si on modifie les notes ou si on configure l'IA plus tard)
router.post(
  "/:id/regenerate-summary",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const photos = await prisma.reportPhoto.findMany({ where: { reportId: existing.id } });
    const aiSummary = await generateSiteReportSummary({
      title: existing.title,
      date: existing.date,
      notes: existing.notes,
      criticalPoints: existing.criticalPoints,
      photoCaptions: photos.map((p) => p.caption),
    });

    const updated = await prisma.siteReport.update({ where: { id: existing.id }, data: { aiSummary } });
    res.json(updated);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { title, date, notes, criticalPoints } = req.body;
    const updated = await prisma.siteReport.update({
      where: { id: req.params.id },
      data: { title, date: date ? new Date(date) : undefined, notes, criticalPoints },
    });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    await prisma.siteReport.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
