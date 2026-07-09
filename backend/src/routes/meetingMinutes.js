const express = require("express");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const TEMPLATE_PATH = path.join(__dirname, "../../templates/pv_chantier_template.docx");

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

async function loadWithAccess(req, res) {
  const mm = await prisma.meetingMinutes.findUnique({ where: { id: req.params.id } });
  if (!mm) {
    res.status(404).json({ error: "PV introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, mm.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return mm;
}

function formatDateFr(d) {
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

// Liste des PV d'un projet
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const list = await prisma.meetingMinutes.findMany({
      where: { projectId },
      orderBy: { numero: "desc" },
    });
    res.json(list);
  })
);

// Cree un PV de chantier (numero auto-incremente par projet, reference auto-generee)
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, lotId, dateReunion, auteur, attendees, observations } = req.body;
    if (!projectId || !dateReunion || !auteur) {
      return res.status(400).json({ error: "projectId, dateReunion et auteur sont requis" });
    }
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const count = await prisma.meetingMinutes.count({ where: { projectId } });
    const numero = count + 1;
    const dateStr = new Date(dateReunion).toISOString().slice(0, 10).replace(/-/g, "");
    const reference = `${project.name}-PV${numero}-${dateStr}-PV chantier ${numero}`;

    const mm = await prisma.meetingMinutes.create({
      data: {
        projectId,
        lotId: lotId || null,
        numero,
        reference,
        dateReunion: new Date(dateReunion),
        auteur,
        attendees: Array.isArray(attendees) ? attendees : [],
        observations: Array.isArray(observations) ? observations : [],
      },
    });
    res.status(201).json(mm);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { lotId, dateReunion, auteur, attendees, observations } = req.body;
    const updated = await prisma.meetingMinutes.update({
      where: { id: req.params.id },
      data: {
        lotId: lotId !== undefined ? lotId || null : undefined,
        dateReunion: dateReunion ? new Date(dateReunion) : undefined,
        auteur,
        attendees: attendees !== undefined ? attendees : undefined,
        observations: observations !== undefined ? observations : undefined,
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
    await prisma.meetingMinutes.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// Genere et telecharge le .docx a partir du template KARNO
router.get(
  "/:id/docx",
  asyncHandler(async (req, res) => {
    const mm = await loadWithAccess(req, res);
    if (!mm) return;

    if (!fs.existsSync(TEMPLATE_PATH)) {
      return res.status(500).json({ error: "Modele de PV introuvable sur le serveur" });
    }

    const content = fs.readFileSync(TEMPLATE_PATH, "binary");
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

    const attendees = Array.isArray(mm.attendees) ? mm.attendees : [];
    const observations = Array.isArray(mm.observations) ? mm.observations : [];

    // reference du fichier : "K-0044-PV3-20260707-PV chantier 3" -> on isole le numero de projet
    const projetPart = mm.reference.replace(/^([^-]+-[^-]+)-.*$/, "$1");

    try {
      doc.render({
        PROJET: projetPart || mm.reference,
        NUMERO_RAPPORT: String(mm.numero),
        REFERENCE: mm.reference,
        DATE_REUNION: formatDateFr(mm.dateReunion),
        DATE_PUBLICATION: formatDateFr(mm.datePublication),
        AUTEUR: mm.auteur,
        attendees: attendees.map((a) => ({
          company: a.company || "",
          name: a.name || "",
          role: a.role || "",
          email: a.email || "",
          tel: a.tel || "",
          presence: a.presence || "",
        })),
        observations: observations.map((o) => ({
          ref: o.ref || "",
          title: o.title || "",
          body: o.body || "",
          resp: o.resp || "",
          pourLe: o.pourLe || "",
        })),
      });
    } catch (err) {
      console.error("Erreur generation PV docx", err.properties || err);
      return res.status(500).json({ error: "Erreur lors de la generation du document" });
    }

    const buf = doc.getZip().generate({ type: "nodebuffer" });
    const fileName = `${mm.reference}.docx`.replace(/[\\/:*?"<>|]/g, "_");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buf);
  })
);

module.exports = router;
