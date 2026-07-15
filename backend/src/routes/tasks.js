const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

// Empeche qu'une tache reference un lot d'un autre projet (fuite croisee de code/nom de lot).
async function assertLotBelongsToProject(projectId, lotId) {
  if (!lotId) return;
  const lot = await prisma.lot.findFirst({ where: { id: lotId, projectId } });
  if (!lot) {
    const err = new Error("Lot introuvable sur ce projet");
    err.statusCode = 404;
    throw err;
  }
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const {
      projectId,
      lotId,
      columnId,
      title,
      description,
      priority,
      startDate,
      dueDate,
      estimatedHours,
      estimatedCost,
      assigneeId,
      dependsOnIds,
    } = req.body;

    if (!projectId || !columnId || !title) {
      return res.status(400).json({ error: "projectId, columnId et title sont requis" });
    }

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    try {
      await assertLotBelongsToProject(projectId, lotId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const count = await prisma.task.count({ where: { columnId } });

    const task = await prisma.task.create({
      data: {
        projectId,
        lotId: lotId || null,
        columnId,
        title,
        description,
        priority: priority || "MEDIUM",
        startDate: startDate ? new Date(startDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        estimatedHours: estimatedHours ? Number(estimatedHours) : null,
        estimatedCost: estimatedCost ? Number(estimatedCost) : 0,
        assigneeId: assigneeId || null,
        createdById: req.user.id,
        dependsOnIds: dependsOnIds || [],
        order: count,
      },
    });

    res.status(201).json(task);
  })
);

async function loadTaskWithAccess(req, res) {
  const task = await prisma.task.findUnique({ where: { id: req.params.id } });
  if (!task) {
    res.status(404).json({ error: "Tache introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, task.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return task;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadTaskWithAccess(req, res);
    if (!existing) return;

    const {
      title,
      description,
      columnId,
      lotId,
      order,
      priority,
      startDate,
      dueDate,
      estimatedHours,
      actualHours,
      estimatedCost,
      actualCost,
      assigneeId,
      dependsOnIds,
    } = req.body;

    try {
      if (lotId !== undefined) await assertLotBelongsToProject(existing.projectId, lotId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: {
        title,
        description,
        columnId,
        lotId: lotId !== undefined ? lotId || null : undefined,
        order,
        priority,
        startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : undefined,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : undefined,
        estimatedHours: estimatedHours !== undefined ? Number(estimatedHours) || null : undefined,
        actualHours: actualHours !== undefined ? Number(actualHours) || null : undefined,
        estimatedCost: estimatedCost !== undefined ? Number(estimatedCost) || 0 : undefined,
        actualCost: actualCost !== undefined ? Number(actualCost) || 0 : undefined,
        assigneeId: assigneeId !== undefined ? assigneeId : undefined,
        dependsOnIds: dependsOnIds !== undefined ? dependsOnIds : undefined,
      },
    });

    res.json(task);
  })
);

// Deplacement rapide dans le Kanban (drag & drop): change de colonne + reordonne
router.patch(
  "/:id/move",
  asyncHandler(async (req, res) => {
    const existing = await loadTaskWithAccess(req, res);
    if (!existing) return;

    const { columnId, order } = req.body;
    const task = await prisma.task.update({
      where: { id: req.params.id },
      data: { columnId, order },
    });
    res.json(task);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadTaskWithAccess(req, res);
    if (!existing) return;

    await prisma.task.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

module.exports = router;
