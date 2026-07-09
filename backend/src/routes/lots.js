const express = require("express");
const path = require("path");
const prisma = require("../db");
const asyncHandler = require("../utils/asyncHandler");
const { requireAuth } = require("../middleware/auth");
const { buildDiuData } = require("../utils/diu");
const { buildDiuPdf } = require("../utils/diuPdf");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

const router = express.Router();
router.use(requireAuth);

// Charge toutes les donnees necessaires au DIU d'un lot
async function loadDiu(req) {
  const lot = await prisma.lot.findUnique({
    where: { id: req.params.id },
    include: { subcontractor: true, units: { orderBy: { name: "asc" } } },
  });
  if (!lot) return null;
  const project = await prisma.project.findFirst({
    where: { id: lot.projectId, organizationId: req.user.organizationId },
  });
  if (!project) return null;
  const [documents, equipments] = await Promise.all([
    prisma.document.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
    prisma.equipment.findMany({ where: { projectId: project.id }, orderBy: { name: "asc" } }),
  ]);
  return buildDiuData({ lot, project, documents, equipments, units: lot.units });
}

async function assertProjectAccess(req, projectId) {
  return prisma.project.findFirst({ where: { id: projectId, organizationId: req.user.organizationId } });
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, code, name, subcontractorId, contractAmount, notes } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    const count = await prisma.lot.count({ where: { projectId } });
    const lot = await prisma.lot.create({
      data: {
        projectId,
        code: code || `BB${count + 1}`,
        name,
        subcontractorId: subcontractorId || null,
        contractAmount: contractAmount ? Number(contractAmount) : null,
        notes,
        order: count,
      },
    });
    res.status(201).json(lot);
  })
);

async function loadWithAccess(req, res) {
  const lot = await prisma.lot.findUnique({ where: { id: req.params.id } });
  if (!lot) {
    res.status(404).json({ error: "Lot introuvable" });
    return null;
  }
  const project = await assertProjectAccess(req, lot.projectId);
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return lot;
}

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { code, name, phase, subcontractorId, contractAmount, notes, order } = req.body;
    const updated = await prisma.lot.update({
      where: { id: req.params.id },
      data: {
        code,
        name,
        phase,
        subcontractorId: subcontractorId !== undefined ? subcontractorId || null : undefined,
        contractAmount: contractAmount !== undefined ? Number(contractAmount) || null : undefined,
        notes,
        order,
      },
    });
    res.json(updated);
  })
);

// Changement rapide de phase (glisser-deposer dans la vue Lots)
router.patch(
  "/:id/phase",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    const { phase } = req.body;
    const updated = await prisma.lot.update({ where: { id: req.params.id }, data: { phase } });
    res.json(updated);
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const existing = await loadWithAccess(req, res);
    if (!existing) return;

    await prisma.lot.delete({ where: { id: req.params.id } });
    res.status(204).end();
  })
);

// --- Checklist type du perimetre contractuel (LotScopeItem) : le "contrat type" par BB ---
// Alimente le tableau OBJET du generateur de Contrats (voir routes/contracts.js), qui reprend
// ces postes comme point de depart modulable pour chaque nouveau contrat de ce lot.
//
// Plusieurs bases pre-remplies, une par "famille" de lot (independant du numero de BB reel d'un
// projet donne, puisque celui-ci varie d'un chantier a l'autre). Chaque famille expose une
// fonction items(opts) : pour DISTRIBUTION_ENTERREE, opts.material (PEX / Terrendis / Acier) et
// opts.insulationClass adaptent le libelle et le detail des postes (soudure si Acier, sablage
// sinon). Les items marques hors perimetre par defaut restent modifiables (case a cocher) au
// niveau de chaque contrat individuel, voir ContractsView.jsx.
const SCOPE_TEMPLATES = {
  ENERGY_CENTER: {
    label: "Energy Center - hydraulique / electrique / regulation (ex: BB2)",
    items: () => [
      { label: "Hydraulique", commentaire: "Tuyauteries, supports, vannes, equipements, rincage, equilibrage, etc." },
      { label: "Electricite", commentaire: "Tableaux, protections, cablages, raccordements, controles RGIE, etc." },
      { label: "Regulation/automation/GTC", commentaire: "Automates, capteurs, actionneurs, I/O, communication, parametrage, etc." },
      { label: "Mise en service globale", commentaire: "Essais coordonnes, assistance aux autres lots, etc." },
      { label: "Documentation as-built", commentaire: "Plans, schemas, notices, parametres, etc." },
    ],
  },
  GEOTHERMIE_FORAGE: {
    label: "Geothermie fermee - forage & liaisons horizontales (ex: BB1)",
    items: () => [
      { label: "Forage des sondes geothermiques", commentaire: "Forage, equipement des sondes, remblai coulis, tests d'etancheite." },
      { label: "Liaisons horizontales champ de sondes -> collecteur", commentaire: "Tranchees, pose, raccordements, sablage." },
      { label: "Raccordement collecteur -> Energy Center", commentaire: "Soudure/assemblage, epreuve de pression." },
      { label: "Releve geometrique et dossier as-built geothermie", commentaire: "Releve geometre, plans as-built des sondes et liaisons." },
      {
        label: "Terrassement et remblaiement",
        commentaire: "Hors perimetre par defaut si realise par un tiers - decocher/adapter selon ce contrat.",
      },
    ],
  },
  DISTRIBUTION_ENTERREE: {
    label: "Distribution enterree - reseau (ex: BB3, BB4)",
    hasMaterial: true,
    items: ({ material, insulationClass } = {}) => {
      const mat = (material || "PEX").trim();
      const classe = insulationClass ? ` (isolation ${insulationClass.trim()})` : "";
      const isSteel = /acier/i.test(mat);
      const items = [
        {
          label: `Fourniture et pose tuyauterie ${mat}${classe}`,
          commentaire: "Vannes, accessoires, raccords, manchons, fils de detection le cas echeant.",
        },
      ];
      items.push(
        isSteel
          ? { label: "Soudure et controle radiographique/ultrasons", commentaire: "Selon norme applicable, rapport de conformite." }
          : { label: "Lit de pose et enrobage sable (sablage)", commentaire: "Conforme aux prescriptions du fabricant." }
      );
      items.push(
        { label: "Epreuve de pression et controle d'etancheite", commentaire: "Apres chaque pose, rapport de conformite." },
        { label: "Releve geometrique et dossier as-built", commentaire: "Releve geometre, plans as-built, reperage des vannes." },
        {
          label: "Terrassement, remblaiement et refection de voirie",
          commentaire: "Hors perimetre par defaut, realise par un tiers - decocher/adapter selon ce contrat.",
        }
      );
      return items;
    },
  },
  SOUS_STATION_SKID: {
    label: "Sous-station SKID en pied de batiment (ex: BB4)",
    items: () => [
      { label: "Fourniture et pose du skid sous-station", commentaire: "Assemblage usine ou sur site, echangeur, pompes, vannes." },
      { label: "Raccordement hydraulique au reseau primaire", commentaire: "Piquage, vannes d'isolement, epreuve de pression." },
      { label: "Raccordement electrique et regulation", commentaire: "Alimentation, armoire, capteurs, communication GTC." },
      { label: "Comptage energie primaire", commentaire: "Compteur d'energie, releve, transmission." },
      { label: "Mise en service et documentation as-built", commentaire: "Essais, reglages, plans/notices as-built." },
    ],
  },
  TECHNIQUES_SPECIALES_APPART: {
    label: "Techniques speciales vers appartements (ex: BB4)",
    items: () => [
      { label: "Distribution secondaire vers appartements", commentaire: "Colonnes montantes ou reseau horizontal vers logements." },
      { label: "Raccordement HIU ou emetteurs par appartement", commentaire: "Pose, raccordement hydraulique et regulation par logement." },
      { label: "Comptage individuel", commentaire: "Compteur d'energie/eau chaude par logement." },
      { label: "Mise en service par logement", commentaire: "Essais, reglages, PV de mise en service par appartement." },
      { label: "Documentation as-built par logement", commentaire: "Plans et fiches techniques par logement." },
    ],
  },
  SOUS_STATIONS_HIU: {
    label: "Sous-stations clientes / HIU (ex: BB5)",
    items: () => [
      { label: "Fourniture et pose des sous-stations clientes (HIU)", commentaire: "Echangeur compact, pompes, regulation integree." },
      { label: "Raccordement reseau primaire/secondaire", commentaire: "Piquage, vannes d'isolement, epreuve de pression." },
      { label: "Comptage energie", commentaire: "Compteur d'energie par HIU, releve, transmission." },
      { label: "Mise en service", commentaire: "Essais, reglages, PV de mise en service." },
      { label: "Documentation as-built", commentaire: "Plans, fiches techniques, parametres par HIU." },
    ],
  },
};

// Liste des bases disponibles (cles + libelles + si un materiau est demande), pour le selecteur
// cote frontend. Volontairement statique/independant du lot : reutilisable sur n'importe quel
// projet, la correspondance BB1/BB2/etc. n'est qu'indicative (donnee a titre d'exemple).
router.get(
  "/scope-templates",
  asyncHandler(async (req, res) => {
    const list = Object.entries(SCOPE_TEMPLATES).map(([key, t]) => ({
      key,
      label: t.label,
      hasMaterial: Boolean(t.hasMaterial),
    }));
    res.json(list);
  })
);

router.get(
  "/:id/scope-items",
  asyncHandler(async (req, res) => {
    const lot = await loadWithAccess(req, res);
    if (!lot) return;
    const items = await prisma.lotScopeItem.findMany({ where: { lotId: lot.id }, orderBy: { order: "asc" } });
    res.json(items);
  })
);

// Cree en une fois les items d'une base pre-remplie (templateKey parmi SCOPE_TEMPLATES). Pour
// DISTRIBUTION_ENTERREE, material/insulationClass adaptent le contenu genere (voir ci-dessus).
// templateKey absent -> ENERGY_CENTER par defaut (comportement historique, retro-compatible).
router.post(
  "/:id/scope-items/standard",
  asyncHandler(async (req, res) => {
    const lot = await loadWithAccess(req, res);
    if (!lot) return;

    const { templateKey, material, insulationClass } = req.body || {};
    const template = SCOPE_TEMPLATES[templateKey] || SCOPE_TEMPLATES.ENERGY_CENTER;
    const items = template.items({ material, insulationClass });

    const count = await prisma.lotScopeItem.count({ where: { lotId: lot.id } });
    const created = await prisma.$transaction(
      items.map((item, i) =>
        prisma.lotScopeItem.create({ data: { lotId: lot.id, label: item.label, commentaire: item.commentaire, order: count + i } })
      )
    );
    res.status(201).json(created);
  })
);

router.post(
  "/:id/scope-items",
  asyncHandler(async (req, res) => {
    const lot = await loadWithAccess(req, res);
    if (!lot) return;
    const { label, commentaire } = req.body;
    if (!label) return res.status(400).json({ error: "label requis" });
    const count = await prisma.lotScopeItem.count({ where: { lotId: lot.id } });
    const item = await prisma.lotScopeItem.create({
      data: { lotId: lot.id, label, commentaire: commentaire || null, order: count },
    });
    res.status(201).json(item);
  })
);

async function loadScopeItemWithAccess(req, res) {
  const item = await prisma.lotScopeItem.findUnique({ where: { id: req.params.itemId } });
  if (!item) {
    res.status(404).json({ error: "Item introuvable" });
    return null;
  }
  const lot = await prisma.lot.findUnique({ where: { id: item.lotId } });
  const project = lot ? await assertProjectAccess(req, lot.projectId) : null;
  if (!project) {
    res.status(403).json({ error: "Acces refuse" });
    return null;
  }
  return item;
}

router.put(
  "/scope-items/:itemId",
  asyncHandler(async (req, res) => {
    const existing = await loadScopeItemWithAccess(req, res);
    if (!existing) return;
    const { label, commentaire, order } = req.body;
    const updated = await prisma.lotScopeItem.update({
      where: { id: req.params.itemId },
      data: { label, commentaire, order },
    });
    res.json(updated);
  })
);

router.delete(
  "/scope-items/:itemId",
  asyncHandler(async (req, res) => {
    const existing = await loadScopeItemWithAccess(req, res);
    if (!existing) return;
    await prisma.lotScopeItem.delete({ where: { id: req.params.itemId } });
    res.status(204).end();
  })
);

// Structure complete du DIU du lot (sections, checklist, inventaires) — pour la page DIU du frontend
router.get(
  "/:id/diu",
  asyncHandler(async (req, res) => {
    const diu = await loadDiu(req);
    if (!diu) return res.status(404).json({ error: "Lot introuvable" });
    res.json(diu);
  })
);

// DIU assemble en un seul PDF : page de garde + mentions legales + checklist + inventaires
// + sommaire + fusion de tous les documents PDF joints au lot.
router.get(
  "/:id/diu.pdf",
  asyncHandler(async (req, res) => {
    const diu = await loadDiu(req);
    if (!diu) return res.status(404).json({ error: "Lot introuvable" });
    // Lecture des fichiers : base de donnees d'abord (persistante), disque en secours
    const fsMod = require("fs");
    const readFile = async (fileUrl) => {
      const name = path.basename(fileUrl);
      const stored = await prisma.storedFile.findUnique({ where: { name } });
      if (stored) return Buffer.from(stored.data);
      try {
        return fsMod.readFileSync(path.join(UPLOAD_DIR, name));
      } catch {
        return null;
      }
    };
    const { bytes, merged, failures, attachments } = await buildDiuPdf(diu, readFile);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="DIU-${diu.lot.code}-${diu.project.name.replace(/[^a-zA-Z0-9-]/g, "_")}.pdf"`
    );
    res.setHeader("X-Diu-Merged", String(merged));
    res.setHeader("X-Diu-Failures", String(failures));
    res.setHeader("X-Diu-Attachments", String(attachments));
    res.send(Buffer.from(bytes));
  })
);

module.exports = router;
