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

// Empeche qu'un lot reference un sous-traitant d'une autre organisation.
async function assertSubcontractorBelongsToOrg(req, subcontractorId) {
  if (!subcontractorId) return;
  const sub = await prisma.subcontractor.findFirst({
    where: { id: subcontractorId, organizationId: req.user.organizationId },
  });
  if (!sub) {
    const err = new Error("Sous-traitant introuvable");
    err.statusCode = 404;
    throw err;
  }
}

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { projectId, code, name, subcontractorId, contractAmount, notes } = req.body;
    if (!projectId || !name) return res.status(400).json({ error: "projectId et name sont requis" });

    const project = await assertProjectAccess(req, projectId);
    if (!project) return res.status(404).json({ error: "Projet introuvable" });

    try {
      await assertSubcontractorBelongsToOrg(req, subcontractorId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }

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
    try {
      if (subcontractorId !== undefined) await assertSubcontractorBelongsToOrg(req, subcontractorId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }
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
// 5 bases pre-remplies, une par famille de Building Block (independant du numero de BB reel d'un
// projet donne, puisque celui-ci varie d'un chantier a l'autre) : BB1 Geothermie, BB2 Chaufferie,
// BB3 Distribution enterree, BB4 Batiment (tuyauterie/skid/mini-local), BB5 Sous-station. Chaque
// famille expose une fonction items(opts) ; DISTRIBUTION_ENTERREE prend en plus opts.material
// (PEX / Terrendis / Acier) et opts.voirieType (adapte le libelle du terrassement selon le type de
// voirie concerne). Les items restent modifiables (case a cocher inclus/exclus, commentaire) au
// niveau de chaque contrat individuel, voir ContractsView.jsx.
const SCOPE_TEMPLATES = {
  BB1_GEOTHERMIE: {
    label: "BB1 - Geothermie fermee (terrassement, liaisons horizontales, forage)",
    items: () => [
      {
        label: "Terrassement et remblaiement",
        commentaire: "Tranchees et fouilles necessaires aux liaisons horizontales et au champ de sondes, remblaiement soigne.",
      },
      {
        label: "Liaisons horizontales champ de sondes -> collecteur",
        commentaire: "Tranchees, pose, raccordements, sablage.",
      },
      {
        label: "Forage geothermique des sondes",
        commentaire: "Forage, equipement des sondes, remblai coulis, tests d'etancheite.",
      },
      { label: "Raccordement collecteur -> Energy Center", commentaire: "Soudure/assemblage, epreuve de pression." },
      { label: "Releve geometrique et dossier as-built geothermie", commentaire: "Releve geometre, plans as-built des sondes et liaisons." },
    ],
  },
  BB2_CHAUFFERIE: {
    label: "BB2 - Chaufferie (hydraulique, sanitaire, electricite, regulation, calorifuge)",
    items: () => [
      { label: "Hydraulique (chauffage)", commentaire: "Tuyauteries, supports, vannes, equipements, rincage, equilibrage, etc." },
      { label: "Sanitaire (ECS)", commentaire: "Production et distribution d'eau chaude sanitaire, bouclage, protection anti-legionellose." },
      { label: "Electricite", commentaire: "Tableaux, protections, cablages, raccordements, controles RGIE, etc." },
      { label: "Regulation/automation/GTC", commentaire: "Automates, capteurs, actionneurs, I/O, communication, parametrage, etc." },
      { label: "Calorifuge", commentaire: "Isolation thermique des tuyauteries et equipements, finition (tole, PVC, etc.) selon plan de calorifuge." },
      { label: "Mise en service globale", commentaire: "Essais coordonnes, assistance aux autres lots, etc." },
      { label: "Documentation as-built", commentaire: "Plans, schemas, notices, parametres, etc." },
    ],
  },
  BB3_DISTRIBUTION_ENTERREE: {
    label: "BB3 - Distribution enterree (pose conduite, terrassement, signalisation, voirie)",
    hasMaterial: true,
    hasVoirieType: true,
    items: ({ material, insulationClass, voirieType } = {}) => {
      const mat = (material || "PEX").trim();
      const classe = insulationClass ? ` (isolation ${insulationClass.trim()})` : "";
      const isSteel = /acier/i.test(mat);
      const voirie = (voirieType || "voirie carrossable").trim();
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
        {
          label: `Terrassement (${voirie})`,
          commentaire: "Ouverture de tranchee, blindage si necessaire, evacuation des terres, adapte au type de voirie concerne.",
        },
        {
          label: "Signalisation de chantier",
          commentaire: "Mise en place et entretien de la signalisation routiere/pietonne conformement a l'autorisation de voirie.",
        },
        {
          label: "Refection de voirie",
          commentaire: "Remblaiement, reconstitution des fondations et du revetement, conforme au CCT applicable (ex: Qualiroute).",
        },
        { label: "Epreuve de pression et controle d'etancheite", commentaire: "Apres chaque pose, rapport de conformite." },
        { label: "Releve geometrique et dossier as-built", commentaire: "Releve geometre, plans as-built, reperage des vannes." }
      );
      return items;
    },
  },
  BB4_BATIMENT: {
    label: "BB4 - Batiment (tuyauterie ECS/chauffage sol, skid, mini-local chaufferie)",
    items: () => [
      {
        label: "Tuyauterie hydraulique batiment (ECS et chauffage au sol)",
        commentaire: "Distribution interieure, colonnes, raccordements aux emetteurs (chauffage au sol) et aux points de puisage (ECS).",
      },
      {
        label: "Skid (sous-station compacte prefabriquee)",
        commentaire: "Fourniture et pose du skid, assemblage usine ou sur site, echangeur, pompes, vannes.",
      },
      {
        label: "Mini-local de chaufferie - electricite",
        commentaire: "Tableaux, protections, cablages, raccordements, controles RGIE du mini-local.",
      },
      {
        label: "Mini-local de chaufferie - hydraulique",
        commentaire: "Tuyauteries, vannes, equipements, rincage et equilibrage du mini-local.",
      },
      { label: "Mise en service et documentation as-built", commentaire: "Essais, reglages, plans/notices as-built." },
    ],
  },
  BB5_SOUS_STATION: {
    label: "BB5 - Sous-station (clientes / HIU)",
    items: () => [
      { label: "Fourniture et pose des sous-stations clientes (HIU)", commentaire: "Echangeur compact, pompes, regulation integree." },
      { label: "Raccordement reseau primaire/secondaire", commentaire: "Piquage, vannes d'isolement, epreuve de pression." },
      { label: "Comptage energie", commentaire: "Compteur d'energie par HIU, releve, transmission." },
      { label: "Mise en service", commentaire: "Essais, reglages, PV de mise en service." },
      { label: "Documentation as-built", commentaire: "Plans, fiches techniques, parametres par HIU." },
    ],
  },
};

// Liste des bases disponibles (cles + libelles + si un materiau/type de voirie est demande), pour
// le selecteur cote frontend. Volontairement statique/independant du lot : reutilisable sur
// n'importe quel projet, la correspondance BB1/BB2/etc. n'est qu'indicative (donnee a titre d'exemple).
router.get(
  "/scope-templates",
  asyncHandler(async (req, res) => {
    const list = Object.entries(SCOPE_TEMPLATES).map(([key, t]) => ({
      key,
      label: t.label,
      hasMaterial: Boolean(t.hasMaterial),
      hasVoirieType: Boolean(t.hasVoirieType),
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
// BB3_DISTRIBUTION_ENTERREE, material/insulationClass/voirieType adaptent le contenu genere (voir
// ci-dessus). templateKey absent -> BB2_CHAUFFERIE par defaut (comportement historique, retro-compatible).
router.post(
  "/:id/scope-items/standard",
  asyncHandler(async (req, res) => {
    const lot = await loadWithAccess(req, res);
    if (!lot) return;

    const { templateKey, material, insulationClass, voirieType } = req.body || {};
    const template = SCOPE_TEMPLATES[templateKey] || SCOPE_TEMPLATES.BB2_CHAUFFERIE;
    const items = template.items({ material, insulationClass, voirieType });

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
