const express = require("express");
const fs = require("fs");
const path = require("path");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { convertDocxBufferToPdf } = require("../utils/docxToPdf");

const router = express.Router();
router.use(requireAuth);

const TEMPLATE_PATH = path.join(__dirname, "../../templates/contrat_soustraitance_template.docx");

// Tous les tags attendus par le template (voir contrat_soustraitance_template.docx). Toute cle
// absente est simplement rendue vide a la generation.
const FIELD_KEYS = [
  "PROJET",
  "CONTACT_NOM",
  "CONTACT_FONCTION",
  "CONTACT_EMAIL",
  "CONTACT_TEL",
  "KARNO_DIR_NOM",
  "KARNO_DIR_EMAIL",
  "KARNO_DIR_TEL",
  "KARNO_PM_NOM",
  "KARNO_PM_EMAIL",
  "KARNO_PM_TEL",
  "ST_NOM",
  "ST_ADRESSE",
  "ST_BCE",
  "ST_SPECIALITE",
  "ST_CEO_NOM",
  "ST_CONTACT1_NOM",
  "ST_CONTACT1_EMAIL",
  "ST_CONTACT1_TEL",
  "ST_CONTACT2_NOM",
  "ST_CONTACT2_FONCTION",
  "ST_CONTACT2_EMAIL",
  "ST_CONTACT2_TEL",
  "ADRESSE_CHANTIER",
  "CHECKINWORK",
  "DATE_DEBUT",
  "DATE_FIN",
  "MONTANT_FORFAIT",
  "MONTANT_GARANTIE",
  "SEUIL_EQUIPEMENT",
  "ENTREPRISE_GENERALE",
  "RESOLIA_ENG_NOM",
  "RESOLIA_ENG_EMAIL",
  "RESOLIA_ENG_TEL",
  "DATE_SIGNATURE",
];

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

async function loadWithAccess(req, res) {
  const contract = await prisma.contract.findUnique({ where: { id: req.params.id } });
  if (!contract) {
    res.status(404).json({ error: "Contrat introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, contract.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return contract;
}

// formate un montant en style "450.000,00" (convention belge/francaise)
function formatMontant(value) {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("fr-BE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId } = req.query;
    if (!projectId) return res.status(400).json({ error: "projectId requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const list = await prisma.contract.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: { subcontractor: { select: { id: true, name: true } }, lot: { select: { id: true, code: true, name: true } } },
    });
    res.json(list);
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, lotId, subcontractorId, title, data } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: "projectId et title sont requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const contract = await prisma.contract.create({
      data: {
        projectId,
        lotId: lotId || null,
        subcontractorId: subcontractorId || null,
        title,
        data: data && typeof data === "object" ? data : {},
      },
    });
    res.status(201).json(contract);
  })
);

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { lotId, subcontractorId, title, data } = req.body;
    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        lotId: lotId !== undefined ? lotId || null : undefined,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        title,
        data: data !== undefined && typeof data === "object" ? data : undefined,
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
    await prisma.contract.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// Construit le .docx (26 pages) a partir du template KARNO et des donnees du contrat. Partagee
// par les routes /:id/docx et /:id/pdf ci-dessous (la seconde convertit ensuite ce buffer via
// LibreOffice, voir utils/docxToPdf.js).
function renderContractDocxBuffer(contract) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    const err = new Error("Modele de contrat introuvable sur le serveur");
    err.statusCode = 500;
    throw err;
  }

  const raw = contract.data && typeof contract.data === "object" ? contract.data : {};
  const renderData = {};
  for (const key of FIELD_KEYS) {
    renderData[key] = raw[key] !== undefined && raw[key] !== null ? String(raw[key]) : "";
  }
  // champs derives / formates
  if (raw.MONTANT_FORFAIT !== undefined) renderData.MONTANT_FORFAIT = formatMontant(raw.MONTANT_FORFAIT);
  if (raw.MONTANT_GARANTIE !== undefined) renderData.MONTANT_GARANTIE = formatMontant(raw.MONTANT_GARANTIE);
  if (raw.SEUIL_EQUIPEMENT !== undefined) renderData.SEUIL_EQUIPEMENT = formatMontant(raw.SEUIL_EQUIPEMENT);
  renderData.KARNO_DIR_NOM_ROLE = raw.KARNO_DIR_NOM ? `${raw.KARNO_DIR_NOM}, Directeur de projets Karno` : "";

  // checklist de perimetre (tableau "Lot / Inclus / Non inclus / Commentaires"), pre-remplie
  // depuis le "contrat type" du lot (LotScopeItem) puis ajustee par contrat (voir data.SCOPE)
  const scopeRaw = Array.isArray(raw.SCOPE) ? raw.SCOPE : [];
  renderData.scope = scopeRaw.map((s) => ({
    label: s.label || "",
    inclus: s.inclus ? "X" : "",
    nonInclus: s.inclus ? "" : "X",
    commentaire: s.commentaire || "",
  }));

  const content = fs.readFileSync(TEMPLATE_PATH, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  try {
    doc.render(renderData);
  } catch (err) {
    console.error("Erreur generation contrat docx", err.properties || err);
    const wrapped = new Error("Erreur lors de la generation du document");
    wrapped.statusCode = 500;
    throw wrapped;
  }

  return doc.getZip().generate({ type: "nodebuffer" });
}

// Genere et telecharge le .docx (26 pages) a partir du template KARNO
router.get(
  "/:id/docx",
  asyncHandler(async (req, res) => {
    const contract = await loadWithAccess(req, res);
    if (!contract) return;

    let buf;
    try {
      buf = renderContractDocxBuffer(contract);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }

    const fileName = `${contract.title || "Contrat"}.docx`.replace(/[\\/:*?"<>|]/g, "_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(buf);
  })
);

// Genere et telecharge le .pdf, converti fidelement depuis le .docx via LibreOffice (voir
// utils/docxToPdf.js). Disponible uniquement en production (image Docker avec LibreOffice
// installe) ; renvoie une erreur explicite en local si soffice n'est pas present.
router.get(
  "/:id/pdf",
  asyncHandler(async (req, res) => {
    const contract = await loadWithAccess(req, res);
    if (!contract) return;

    let docxBuf;
    try {
      docxBuf = renderContractDocxBuffer(contract);
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }

    let pdfBuf;
    try {
      pdfBuf = await convertDocxBufferToPdf(docxBuf);
    } catch (err) {
      console.error("Erreur conversion PDF contrat", err);
      return res.status(500).json({ error: err.message || "Erreur lors de la conversion en PDF" });
    }

    const fileName = `${contract.title || "Contrat"}.pdf`.replace(/[\\/:*?"<>|]/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(pdfBuf);
  })
);

module.exports = router;
