const express = require("express");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const pathMod = require("path");
const fsMod = require("fs");
const { buildDiuData } = require("../utils/diu");
const { buildAsbuiltPdf } = require("../utils/asbuiltPdf");
const { getTemplate, getLotTemplate } = require("../utils/projectTemplates");

const router = express.Router();
router.use(requireAuth);

const DEFAULT_COLUMNS = ["A faire", "En cours", "En revue", "Termine"];

// Liste des projets de l'organisation de l'utilisateur connecte, avec quelques indicateurs
// cles (budget consomme, documents manquants) pour distinguer rapidement plusieurs projets
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const projects = await prisma.project.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { tasks: true, lots: true } },
      },
    });

    const projectIds = projects.map((p) => p.id);

    const [expenseByProject, missingDocsByProject] = await Promise.all([
      prisma.budgetItem.groupBy({
        by: ["projectId", "type"],
        where: { projectId: { in: projectIds } },
        _sum: { amount: true },
      }),
      prisma.document.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "MISSING" },
        _count: true,
      }),
    ]);

    const spentByProject = {};
    for (const row of expenseByProject) {
      if (row.type === "expense") spentByProject[row.projectId] = row._sum.amount || 0;
    }
    const missingByProject = Object.fromEntries(missingDocsByProject.map((r) => [r.projectId, r._count]));

    const enriched = projects.map((p) => ({
      ...p,
      totalSpent: spentByProject[p.id] || 0,
      missingDocuments: missingByProject[p.id] || 0,
    }));

    res.json(enriched);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { name, description, startDate, endDate, budgetTotal, type, odooProjectRef, useTemplate } = req.body;
    if (!name) return res.status(400).json({ error: "Le nom du projet est requis" });

    const projectType = type || "AUTRE";
    const template = useTemplate === false ? { tasks: [], documents: [] } : getTemplate(projectType);

    const project = await prisma.project.create({
      data: {
        name,
        description,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        budgetTotal: budgetTotal ? Number(budgetTotal) : 0,
        type: projectType,
        odooProjectRef: odooProjectRef || name,
        organizationId: req.user.organizationId,
        columns: {
          create: DEFAULT_COLUMNS.map((colName, i) => ({ name: colName, order: i })),
        },
        members: {
          create: { userId: req.user.id },
        },
        documents: {
          create: template.documents.map((d) => ({ name: d.name, category: d.category })),
        },
        lots: {
          create:
            useTemplate === false
              ? []
              : getLotTemplate(projectType).map((lot, i) => ({ code: lot.code, name: lot.name, order: i })),
        },
      },
      include: { columns: true },
    });

    // Injecte les taches type dans la premiere colonne (checklist metier par type de projet)
    if (template.tasks.length > 0) {
      const firstColumn = project.columns[0];
      await prisma.task.createMany({
        data: template.tasks.map((title, i) => ({
          projectId: project.id,
          columnId: firstColumn.id,
          title,
          order: i,
          createdById: req.user.id,
        })),
      });
    }

    const full = await prisma.project.findUnique({
      where: { id: project.id },
      include: { columns: { include: { tasks: true } }, lots: true },
    });

    res.status(201).json(full);
  })
);

// Verifie que le projet demande appartient bien a l'organisation de l'utilisateur
async function loadProjectOrFail(req, res) {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
  });
  if (!project) {
    res.status(404).json({ error: "Projet introuvable" });
    return null;
  }
  return project;
}

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
      include: {
        columns: { orderBy: { order: "asc" }, include: { tasks: { orderBy: { order: "asc" } } } },
        tasks: { orderBy: { order: "asc" } },
        milestones: { orderBy: { date: "asc" } },
        budgetItems: {
          orderBy: { date: "desc" },
          include: {
            subcontractor: { select: { id: true, name: true } },
            lot: { select: { id: true, code: true, name: true } },
            invoices: { select: { id: true, label: true, amount: true, status: true } },
          },
        },
        members: { include: { user: { select: { id: true, name: true, email: true } } } },
        documents: { orderBy: { createdAt: "desc" }, include: { subcontractor: true } },
        equipments: {
          orderBy: { createdAt: "desc" },
          include: {
            lot: { select: { id: true, code: true, name: true } },
            maintenanceRecords: { orderBy: { date: "desc" } },
          },
        },
        siteReports: { orderBy: { date: "desc" }, include: { photos: true, author: { select: { id: true, name: true } } } },
        lots: {
          orderBy: { order: "asc" },
          include: {
            subcontractor: true,
            documents: { orderBy: { createdAt: "desc" } },
            progressStatements: { orderBy: { number: "desc" } },
            unitStepTemplates: { orderBy: { order: "asc" } },
            units: {
              orderBy: { name: "asc" },
              include: { steps: true },
            },
          },
        },
      },
    });
    if (!project) return res.status(404).json({ error: "Projet introuvable" });
    res.json(project);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadProjectOrFail(req, res);
    if (!existing) return;

    const { name, description, startDate, endDate, budgetTotal, status, type, odooProjectRef } = req.body;
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: {
        name,
        description,
        status,
        type,
        odooProjectRef,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        budgetTotal: budgetTotal !== undefined ? Number(budgetTotal) : undefined,
      },
    });
    res.json(project);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadProjectOrFail(req, res);
    if (!existing) return;

    await prisma.project.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// Ajouter un membre de l'organisation au projet
router.post(
  "/:id/members",
  asyncHandler(async (req, res) => {
    const existing = await loadProjectOrFail(req, res);
    if (!existing) return;

    const { userId } = req.body;
    const user = await prisma.user.findFirst({ where: { id: userId, organizationId: req.user.organizationId } });
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable dans cette organisation" });

    const member = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: req.params.id, userId } },
      update: {},
      create: { projectId: req.params.id, userId },
    });
    res.status(201).json(member);
  })
);


// ----- Dossier as-built complet -----
const ASBUILT_UPLOAD_DIR = pathMod.join(__dirname, "..", "..", "uploads");

async function loadAsbuiltData(req) {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.user.organizationId },
    include: {
      lots: { orderBy: { order: "asc" }, include: { subcontractor: true, units: { orderBy: { name: "asc" } } } },
    },
  });
  if (!project) return null;
  const [documents, equipments] = await Promise.all([
    prisma.document.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);
  const dius = project.lots.map((lot) => ({
    lot,
    diu: buildDiuData({ lot, project, documents, equipments, units: lot.units }),
  }));
  const transverseDocs = documents.filter((d) => !d.lotId);
  return { project, dius, transverseDocs };
}

// Synthese JSON pour la page de controle (completude par lot)
router.get(
  "/:id/asbuilt-status",
  asyncHandler(async (req, res) => {
    const data = await loadAsbuiltData(req);
    if (!data) return res.status(404).json({ error: "Projet introuvable" });
    res.json({
      lots: data.dius.map(({ lot, diu }) => ({
        lotId: lot.id,
        code: lot.code,
        name: lot.name,
        completeness: diu.completeness,
        missing: diu.required.filter((r) => r.status !== "OK").map((r) => ({ label: r.label, status: r.status })),
        docs: diu.sections.reduce((s, x) => s + x.docs.length, 0),
        docsWithFile: diu.sections.reduce((s, x) => s + x.docs.filter((d) => d.fileUrl).length, 0),
      })),
      transverse: {
        total: data.transverseDocs.length,
        withFile: data.transverseDocs.filter((d) => d.fileUrl).length,
      },
    });
  })
);

// Le dossier complet en un seul PDF
router.get(
  "/:id/asbuilt.pdf",
  asyncHandler(async (req, res) => {
    const data = await loadAsbuiltData(req);
    if (!data) return res.status(404).json({ error: "Projet introuvable" });
    const readFile = async (fileUrl) => {
      const name = pathMod.basename(fileUrl);
      const stored = await prisma.storedFile.findUnique({ where: { name } });
      if (stored) return Buffer.from(stored.data);
      try {
        return fsMod.readFileSync(pathMod.join(ASBUILT_UPLOAD_DIR, name));
      } catch {
        return null;
      }
    };
    const { bytes, merged, failures, attachments } = await buildAsbuiltPdf({ ...data, readFile });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="AsBuilt-${data.project.name.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`);
    res.setHeader("X-Asbuilt-Merged", String(merged));
    res.setHeader("X-Asbuilt-Failures", String(failures));
    res.setHeader("X-Asbuilt-Attachments", String(attachments));
    res.send(Buffer.from(bytes));
  })
);

module.exports = router;
