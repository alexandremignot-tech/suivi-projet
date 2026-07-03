const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// Vue transverse a tous les projets de l'organisation : documents manquants/en retard,
// maintenance d'equipements due, et etats d'avancement en attente de validation.
// Pratique quand on gere beaucoup de projets en parallele et qu'on veut un seul endroit
// pour voir ce qui necessite une action.
router.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    const organizationId = req.user.organizationId;

    const [missingDocuments, equipments, pendingStatements, upcomingMilestones] = await Promise.all([
      prisma.document.findMany({
        where: { status: "MISSING", project: { organizationId } },
        include: {
          project: { select: { id: true, name: true } },
          lot: { select: { id: true, code: true, name: true } },
          subcontractor: { select: { id: true, name: true } },
        },
        orderBy: { deadline: "asc" },
      }),
      prisma.equipment.findMany({
        where: { project: { organizationId }, maintenanceIntervalDays: { not: null } },
        include: { project: { select: { id: true, name: true } } },
      }),
      prisma.progressStatement.findMany({
        where: { status: "SUBMITTED", lot: { project: { organizationId } } },
        include: {
          lot: { select: { id: true, code: true, name: true, project: { select: { id: true, name: true } } } },
          subcontractor: { select: { id: true, name: true } },
        },
        orderBy: { date: "desc" },
      }),
      prisma.milestone.findMany({
        where: {
          done: false,
          project: { organizationId },
          date: { lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
        },
        include: { project: { select: { id: true, name: true } } },
        orderBy: { date: "asc" },
      }),
    ]);

    const now = new Date();
    const overdueDocuments = missingDocuments.filter((d) => d.deadline && new Date(d.deadline) < now);

    const maintenanceDue = equipments
      .map((eq) => {
        const base = eq.lastMaintenanceDate ? new Date(eq.lastMaintenanceDate) : new Date(eq.createdAt);
        const next = new Date(base.getTime() + eq.maintenanceIntervalDays * 24 * 60 * 60 * 1000);
        return { ...eq, nextMaintenance: next };
      })
      .filter((eq) => eq.nextMaintenance < now);

    res.json({
      missingDocuments,
      overdueDocuments,
      maintenanceDue,
      pendingStatements,
      upcomingMilestones,
    });
  })
);

module.exports = router;
