const express = require("express");
const PDFDocument = require("pdfkit");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const USER_SELECT = { id: true, name: true, email: true };

// Un backup couvre les taches/jalons du proprietaire pendant une periode donnee. La todo n'est
// jamais figee : elle est recalculee a chaque consultation (voir buildTodo), pour rester a jour
// meme si de nouvelles taches apparaissent pendant l'absence.
async function buildTodo(backup) {
  const memberships = await prisma.projectMember.findMany({
    where: { userId: backup.ownerId },
    select: { projectId: true },
  });
  const projectIds = memberships.map((m) => m.projectId);

  const [tasks, milestones] = await Promise.all([
    prisma.task.findMany({
      where: {
        assigneeId: backup.ownerId,
        dueDate: { lte: backup.endDate },
      },
      include: {
        project: { select: { id: true, name: true } },
        lot: { select: { id: true, code: true, name: true } },
        column: { select: { name: true, order: true } },
      },
      orderBy: { dueDate: "asc" },
    }),
    projectIds.length
      ? prisma.milestone.findMany({
          where: {
            projectId: { in: projectIds },
            done: false,
            date: { lte: backup.endDate },
          },
          include: { project: { select: { id: true, name: true } } },
          orderBy: { date: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // exclut les taches deja dans la derniere colonne (consideree "terminee") de leur projet
  const lastColumnOrderByProject = {};
  for (const t of tasks) {
    if (!(t.projectId in lastColumnOrderByProject)) {
      const cols = await prisma.column.findMany({ where: { projectId: t.projectId }, orderBy: { order: "desc" }, take: 1 });
      lastColumnOrderByProject[t.projectId] = cols[0]?.order ?? null;
    }
  }
  const openTasks = tasks.filter((t) => t.column.order !== lastColumnOrderByProject[t.projectId]);

  const now = new Date();
  const overdueTasks = openTasks.filter((t) => t.dueDate && new Date(t.dueDate) < now);
  const upcomingTasks = openTasks.filter((t) => !t.dueDate || new Date(t.dueDate) >= now);
  const overdueMilestones = milestones.filter((m) => new Date(m.date) < now);
  const upcomingMilestones = milestones.filter((m) => new Date(m.date) >= now);

  return { overdueTasks, upcomingTasks, overdueMilestones, upcomingMilestones };
}

async function loadWithAccess(req, res) {
  const backup = await prisma.backup.findUnique({
    where: { id: req.params.id },
    include: { owner: { select: USER_SELECT }, delegate: { select: USER_SELECT } },
  });
  if (!backup) {
    res.status(404).json({ error: "Backup introuvable" });
    return null;
  }
  if (backup.organizationId !== req.user.organizationId) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  if (backup.ownerId !== req.user.id && backup.delegateId !== req.user.id) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return backup;
}

// Liste les backups ou je suis proprietaire ET ceux ou je suis le collegue designe
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const [asOwner, asDelegate] = await Promise.all([
      prisma.backup.findMany({
        where: { ownerId: req.user.id },
        include: { owner: { select: USER_SELECT }, delegate: { select: USER_SELECT } },
        orderBy: { startDate: "desc" },
      }),
      prisma.backup.findMany({
        where: { delegateId: req.user.id },
        include: { owner: { select: USER_SELECT }, delegate: { select: USER_SELECT } },
        orderBy: { startDate: "desc" },
      }),
    ]);
    res.json({ asOwner, asDelegate });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { delegateId, startDate, endDate, note } = req.body;
    if (!delegateId || !startDate || !endDate) {
      return res.status(400).json({ error: "delegateId, startDate et endDate sont requis" });
    }
    if (delegateId === req.user.id) {
      return res.status(400).json({ error: "Le collegue doit etre different de vous-meme" });
    }
    const delegate = await prisma.user.findFirst({ where: { id: delegateId, organizationId: req.user.organizationId } });
    if (!delegate) return res.status(404).json({ error: "Collegue introuvable dans cette organisation" });

    const backup = await prisma.backup.create({
      data: {
        organizationId: req.user.organizationId,
        ownerId: req.user.id,
        delegateId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        note: note || null,
      },
      include: { owner: { select: USER_SELECT }, delegate: { select: USER_SELECT } },
    });
    res.status(201).json(backup);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const backup = await loadWithAccess(req, res);
    if (!backup) return;
    if (backup.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Seul le proprietaire peut supprimer ce backup" });
    }
    await prisma.backup.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

router.get(
  "/:id/todo",
  asyncHandler(async (req, res) => {
    const backup = await loadWithAccess(req, res);
    if (!backup) return;
    const todo = await buildTodo(backup);
    res.json({ backup, ...todo });
  })
);

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "-";
}

router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const backup = await loadWithAccess(req, res);
    if (!backup) return;
    const { overdueTasks, upcomingTasks, overdueMilestones, upcomingMilestones } = await buildTodo(backup);

    const doc = new PDFDocument({ margin: 50 });
    const fileName = `Backup_${backup.owner.name.replace(/\s+/g, "_")}_${fmtDate(backup.startDate).replace(/\//g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    doc.pipe(res);

    doc.fontSize(18).fillColor("#c0282d").text("Backup / Couverture d'absence", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor("#535353");
    doc.text(`Absent(e) : ${backup.owner.name} (${backup.owner.email})`);
    doc.text(`Collegue en couverture : ${backup.delegate.name} (${backup.delegate.email})`);
    doc.text(`Periode : du ${fmtDate(backup.startDate)} au ${fmtDate(backup.endDate)}`);
    if (backup.note) {
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor("#ee5924").text("Consignes :", { continued: false });
      doc.fillColor("#535353").text(backup.note);
    }
    doc.moveDown(1);

    function section(title, items, renderLine) {
      doc.fontSize(13).fillColor("#c0282d").text(title);
      doc.moveDown(0.3);
      if (items.length === 0) {
        doc.fontSize(10).fillColor("#999999").text("Rien a signaler.");
      } else {
        doc.fontSize(10).fillColor("#535353");
        items.forEach((it) => {
          doc.text(renderLine(it), { indent: 10 });
        });
      }
      doc.moveDown(1);
    }

    section("Taches en retard", overdueTasks, (t) => `[EN RETARD] ${t.title} — ${t.project.name}${t.lot ? " / " + t.lot.code : ""} — echeance ${fmtDate(t.dueDate)}`);
    section("Taches a echeance pendant l'absence", upcomingTasks, (t) => `${t.title} — ${t.project.name}${t.lot ? " / " + t.lot.code : ""} — echeance ${fmtDate(t.dueDate)}`);
    section("Jalons deja depasses (non coches)", overdueMilestones, (m) => `[EN RETARD] ${m.name} — ${m.project.name} — ${fmtDate(m.date)}`);
    section("Jalons a venir pendant l'absence", upcomingMilestones, (m) => `${m.name} — ${m.project.name} — ${fmtDate(m.date)}`);

    doc.end();
  })
);

module.exports = router;
