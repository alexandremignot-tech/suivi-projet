const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { v4: uuid } = require("uuid");
const PizZip = require("pizzip");
const Docxtemplater = require("docxtemplater");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { convertDocxBufferToPdf } = require("../utils/docxToPdf");
const { extractContractInputData } = require("../utils/contractExtraction");

const router = express.Router();
router.use(requireAuth);

// Meme repertoire d'upload que routes/uploads.js (disque local, sert via express.static("/uploads")).
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const sourceFileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
// 20 Mo max, coherent avec la limite du comparateur d'offres (devis/BC/mail scannes)
const uploadSourceFile = multer({ storage: sourceFileStorage, limits: { fileSize: 20 * 1024 * 1024 } });

// Tous les tags attendus par le template complet (voir contrat_soustraitance_template.docx).
// Toute cle absente est simplement rendue vide a la generation.
const FIELD_KEYS_COMPLET = [
  "PROJET",
  "PROJET_DESCRIPTION",
  "CONTACT_NOM",
  "CONTACT_FONCTION",
  "CONTACT_EMAIL",
  "CONTACT_TEL",
  "KARNO_DIR_NOM",
  "KARNO_DIR_EMAIL",
  "KARNO_DIR_TEL",
  "KARNO_CONTACT2_NOM",
  "KARNO_CONTACT2_EMAIL",
  "KARNO_CONTACT2_TEL",
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
  "REFERENCE_CHANTIER",
  "ADRESSE_CHANTIER",
  "MAITRE_OUVRAGE",
  "CHECKINWORK",
  "DATE_DEBUT",
  "DUREE_PREVISIONNELLE",
  "DATE_FIN",
  "MONTANT_FORFAIT",
  "MONTANT_GARANTIE",
  "SEUIL_EQUIPEMENT",
  "ENTREPRISE_GENERALE",
  "RESOLIA_ENG_NOM",
  "RESOLIA_ENG_EMAIL",
  "RESOLIA_ENG_TEL",
  "LIEU_SIGNATURE",
  "DATE_SIGNATURE",
];

// Champs du modele "leger" (15 articles, pour petits marches, tous metiers confondus) : memes
// noms que le contrat complet la ou les notions se recoupent (reference chantier, parties, dates,
// prix, signature), pour rester coherent d'un modele a l'autre. La liste de prestations utilise
// la meme checklist modulable {#scope} que le contrat complet (voir SCOPE dans data), ce qui
// permet de servir n'importe quel petit marche (soudure, forage, ou autre) sans champ dedie.
const FIELD_KEYS_LEGER = [
  "PROJET",
  "PROJET_DESCRIPTION",
  "CONTACT_NOM",
  "CONTACT_FONCTION",
  "CONTACT_EMAIL",
  "CONTACT_TEL",
  "KARNO_DIR_NOM",
  "KARNO_CONTACT2_NOM",
  "KARNO_CONTACT2_EMAIL",
  "KARNO_CONTACT2_TEL",
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
  "REFERENCE_CHANTIER",
  "ADRESSE_CHANTIER",
  "MAITRE_OUVRAGE",
  "MONTANT_FORFAIT",
  "DATE_DEBUT",
  "DUREE_PREVISIONNELLE",
  "DATE_FIN",
  "LIEU_SIGNATURE",
  "DATE_SIGNATURE",
];

// Config centrale des modeles de contrat disponibles. templateKey (colonne Contract.templateKey)
// determine le fichier .docx utilise et la liste de champs valides pour la generation.
const CONTRACT_TEMPLATES = {
  COMPLET: {
    label: "Contrat complet (30 articles)",
    description: "Structure legale complete (definitions, RACI, RGPD, annexes...), pour les marches importants.",
    path: path.join(__dirname, "../../templates/contrat_soustraitance_template.docx"),
    fieldKeys: FIELD_KEYS_COMPLET,
    hasScope: true,
  },
  LEGER: {
    label: "Contrat leger (15 articles)",
    description: "Structure courte (chantier, prestations, obligations, paiement, garantie, assurances...), pour les petits marches, tous metiers confondus.",
    path: path.join(__dirname, "../../templates/contrat_leger_template.docx"),
    fieldKeys: FIELD_KEYS_LEGER,
    hasScope: true,
  },
};

function resolveTemplate(templateKey) {
  return CONTRACT_TEMPLATES[templateKey] || CONTRACT_TEMPLATES.COMPLET;
}

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

// Liste des modeles de contrat disponibles (pour le selecteur "Type de contrat" du frontend)
router.get(
  "/templates",
  asyncHandler(async (req, res) => {
    const list = Object.entries(CONTRACT_TEMPLATES).map(([key, t]) => ({
      key,
      label: t.label,
      description: t.description,
      hasScope: t.hasScope,
      fieldKeys: t.fieldKeys,
    }));
    res.json(list);
  })
);

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

// Verifie qu'un achat (BudgetItem) appartient bien au projet et n'est pas deja lie a un autre
// contrat (relation 1-1 : un achat ne peut alimenter qu'un seul contrat). Renvoie l'achat ou lance
// une erreur {statusCode, message} exploitable par les routes POST/PUT ci-dessous.
async function assertBudgetItemLinkable(projectId, budgetItemId, currentContractId) {
  if (!budgetItemId) return null;
  const item = await prisma.budgetItem.findFirst({
    where: { id: budgetItemId, projectId },
    include: { contract: { select: { id: true, title: true } } },
  });
  if (!item) {
    const err = new Error("Achat introuvable sur ce projet");
    err.statusCode = 404;
    throw err;
  }
  if (item.contract && item.contract.id !== currentContractId) {
    const err = new Error(`Cet achat est deja lie au contrat "${item.contract.title}"`);
    err.statusCode = 409;
    throw err;
  }
  return item;
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, lotId, subcontractorId, title, templateKey, data, budgetItemId, sourceFileUrl, sourceFileName } = req.body;
    if (!projectId || !title) return res.status(400).json({ error: "projectId et title sont requis" });
    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    try {
      await assertBudgetItemLinkable(projectId, budgetItemId, null);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }

    const contract = await prisma.contract.create({
      data: {
        projectId,
        lotId: lotId || null,
        subcontractorId: subcontractorId || null,
        title,
        templateKey: CONTRACT_TEMPLATES[templateKey] ? templateKey : "COMPLET",
        data: data && typeof data === "object" ? data : {},
        budgetItemId: budgetItemId || null,
        sourceFileUrl: sourceFileUrl || null,
        sourceFileName: sourceFileName || null,
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

    const { lotId, subcontractorId, title, templateKey, data, budgetItemId, sourceFileUrl, sourceFileName } = req.body;

    if (budgetItemId !== undefined) {
      try {
        await assertBudgetItemLinkable(existing.projectId, budgetItemId, existing.id);
      } catch (err) {
        return res.status(err.statusCode || 400).json({ error: err.message });
      }
    }

    const updated = await prisma.contract.update({
      where: { id: req.params.id },
      data: {
        lotId: lotId !== undefined ? lotId || null : undefined,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        title,
        templateKey: templateKey !== undefined ? (CONTRACT_TEMPLATES[templateKey] ? templateKey : "COMPLET") : undefined,
        data: data !== undefined && typeof data === "object" ? data : undefined,
        budgetItemId: budgetItemId !== undefined ? budgetItemId || null : undefined,
        sourceFileUrl: sourceFileUrl !== undefined ? sourceFileUrl || null : undefined,
        sourceFileName: sourceFileName !== undefined ? sourceFileName || null : undefined,
      },
    });
    res.json(updated);
  })
);

// Import assiste par IA : upload d'un devis / bon de commande / mail fournisseur, extrait les
// champs du contrat (identite du sous-traitant, montant, chantier, perimetre propose) via Claude.
// Le fichier est conserve sur disque (meme mecanisme que /api/uploads) et son URL est renvoyee
// avec le resultat, pour que le frontend puisse l'inclure dans la creation du contrat une fois
// les champs relus/corriges par l'utilisateur. Aucune ecriture en base ici (pas de Contract cree).
router.post(
  "/extract",
  uploadSourceFile.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: "Aucun fichier recu" });

    let extracted;
    try {
      extracted = await extractContractInputData({
        buffer: fs.readFileSync(req.file.path),
        mimetype: req.file.mimetype,
        filename: req.file.originalname,
      });
    } catch (err) {
      return res.status(err.statusCode || 500).json({ error: err.message });
    }

    res.status(200).json({
      ...extracted,
      sourceFileUrl: `/uploads/${req.file.filename}`,
      sourceFileName: req.file.originalname,
    });
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

// Construit le .docx a partir du template KARNO correspondant au templateKey du contrat (complet
// a 30 articles, ou l'un des modeles legers par metier) et des donnees du contrat. Partagee par
// les routes /:id/docx et /:id/pdf ci-dessous (la seconde convertit ensuite ce buffer via
// LibreOffice, voir utils/docxToPdf.js).
function renderContractDocxBuffer(contract) {
  const template = resolveTemplate(contract.templateKey);

  if (!fs.existsSync(template.path)) {
    const err = new Error("Modele de contrat introuvable sur le serveur");
    err.statusCode = 500;
    throw err;
  }

  const raw = contract.data && typeof contract.data === "object" ? contract.data : {};
  const renderData = {};
  for (const key of template.fieldKeys) {
    renderData[key] = raw[key] !== undefined && raw[key] !== null ? String(raw[key]) : "";
  }
  // champs derives / formates
  if (raw.MONTANT_FORFAIT !== undefined) renderData.MONTANT_FORFAIT = formatMontant(raw.MONTANT_FORFAIT);
  if (raw.MONTANT_GARANTIE !== undefined) renderData.MONTANT_GARANTIE = formatMontant(raw.MONTANT_GARANTIE);
  if (raw.SEUIL_EQUIPEMENT !== undefined) renderData.SEUIL_EQUIPEMENT = formatMontant(raw.SEUIL_EQUIPEMENT);

  // liste a puces du perimetre (article 3.1 du contrat complet uniquement), pre-remplie depuis le
  // "contrat type" du lot (LotScopeItem) puis ajustee par contrat (voir data.SCOPE). Ignoree par
  // les modeles legers (pas de tag {#scope} dans leur template), docxtemplater l'ignore alors sans erreur.
  const scopeRaw = Array.isArray(raw.SCOPE) ? raw.SCOPE : [];
  renderData.scope = scopeRaw.map((s) => ({
    label: s.label || "",
    inclus: Boolean(s.inclus),
    commentaire: s.commentaire || "",
  }));

  const content = fs.readFileSync(template.path, "binary");
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

// Genere et telecharge le .docx a partir du template KARNO
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
