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
    const { projectId, lotId, name, category, subcontractorId, deadline, notes, fileUrl, fileName } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const document = await prisma.document.create({
      data: {
        projectId,
        lotId: lotId || null,
        name,
        category: category || "Autre",
        subcontractorId: subcontractorId || null,
        deadline: deadline ? new Date(deadline) : null,
        notes,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        status: fileUrl ? "RECEIVED" : "MISSING",
        receivedAt: fileUrl ? new Date() : null,
      },
    });
    res.status(201).json(document);
  })
);

async function loadWithAccess(req, res) {
  const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!doc) {
    res.status(404).json({ error: "Document introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, doc.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return doc;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { name, category, status, subcontractorId, lotId, deadline, notes, fileUrl, fileName } = req.body;

    const data = {
      name,
      category,
      status,
      lotId: lotId !== undefined ? lotId || null : undefined,
      subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
      deadline: deadline !== undefined ? (deadline ? new Date(deadline) : null) : undefined,
      notes,
      fileUrl: fileUrl !== undefined ? fileUrl : undefined,
      fileName: fileName !== undefined ? fileName : undefined,
    };

    // Si on vient de recevoir un fichier ou de marquer comme recu, on horodate
    if ((fileUrl && !existing.fileUrl) || (status === "RECEIVED" && existing.status === "MISSING")) {
      data.receivedAt = new Date();
      if (!status) data.status = "RECEIVED";
    }

    const updated = await prisma.document.update({ where: { id: req.params.id }, data });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    await prisma.document.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
