const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

// Liste des points ouverts d'un projet
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId est requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const issues = await prisma.issue.findMany({
      where: { projectId },
      include: { lot: { select: { id: true, code: true } } },
      orderBy: [{ status: "asc" }, { number: "asc" }],
    });
    res.json(issues);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, lotId, number, status, topic, title, description, action, assignee, author, response, dueDate } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: "projectId et title sont requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const max = await prisma.issue.aggregate({ where: { projectId }, _max: { number: true } });
    const issue = await prisma.issue.create({
      data: {
        projectId,
        lotId: lotId || null,
        number: number ? Number(number) : (max._max.number || 0) + 1,
        status: status || "OPEN",
        topic,
        title,
        description,
        action,
        assignee,
        author,
        response,
        dueDate: dueDate ? new Date(dueDate) : null,
        closedAt: status === "CLOSED" ? new Date() : null,
      },
    });
    res.status(201).json(issue);
  })
);

async function loadWithAccess(req, res) {
  const issue = await prisma.issue.findUnique({ where: { id: req.params.id } });
  if (!issue) {
    res.status(404).json({ error: "Point introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, issue.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return issue;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;
    const { lotId, number, status, topic, title, description, action, assignee, author, response, dueDate } = req.body;
    const updated = await prisma.issue.update({
      where: { id: req.params.id },
      data: {
        lotId: lotId !== undefined ? lotId || null : undefined,
        number: number !== undefined ? Number(number) : undefined,
        status,
        topic,
        title,
        description,
        action,
        assignee,
        author,
        response,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        closedAt:
          status === "CLOSED" && existing.status !== "CLOSED"
            ? new Date()
            : status && status !== "CLOSED"
              ? null
              : undefined,
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
    await prisma.issue.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
