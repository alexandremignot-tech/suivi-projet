// Templates de checklist (taches + documents attendus) par type de projet.
// Appliques automatiquement a la creation d'un projet pour demarrer avec une base adaptee au metier.

const COMMON_DOCUMENTS = [
  { name: "PV de reception des travaux", category: "PV de reception" },
  { name: "Manuel d'exploitation et de maintenance", category: "Manuel d'exploitation" },
  { name: "Garanties constructeur", category: "Garantie constructeur" },
  { name: "Notice de securite / consignes", category: "Notice de securite" },
];

// Documents transverses au projet (pas lies a un lot particulier), inspires de dossiers
// reglementaires reels : PEB (performance energetique du batiment), CSS (plan securite-sante),
// DIU global (dossier d'intervention ulterieure), Admin/Securite.
const TRANSVERSE_DOCUMENTS = [
  { name: "Etude PEB", category: "PEB" },
  { name: "Plan de securite et de sante (CSS)", category: "CSS" },
  { name: "Dossier d'intervention ulterieure (DIU) global", category: "DIU global" },
  { name: "Dossier administratif et securite", category: "Admin / Securite" },
];

// Templates de lots (Building Blocks) par type de projet : chaque lot suivra le parcours
// RFP/RFQ -> Analyse des offres -> Contrat -> Suivi -> Reception/DIU (voir enum LotPhase).
const LOT_TEMPLATES = {
  RESEAU_CHALEUR: [
    { code: "BB1", name: "Forage / sondes geothermiques" },
    { code: "BB2", name: "Chaufferie / Energy Center" },
    { code: "BB3", name: "Reseau de distribution" },
    { code: "BB4", name: "Hydraulique / Regulation" },
    { code: "BB5", name: "Sous-stations clientes" },
    { code: "BB6", name: "Electricite" },
    { code: "BB7", name: "Genie civil / Batiment technique" },
  ],
  GEOTHERMIE: [
    { code: "BB1", name: "Forage / sondes geothermiques" },
    { code: "BB2", name: "Pompes a chaleur et hydraulique" },
    { code: "BB3", name: "Regulation" },
    { code: "BB4", name: "Electricite" },
    { code: "BB5", name: "Genie civil" },
  ],
  CHAUFFERIE: [
    { code: "BB1", name: "Chaudieres et generation" },
    { code: "BB2", name: "Hydraulique / Distribution" },
    { code: "BB3", name: "Regulation" },
    { code: "BB4", name: "Electricite" },
    { code: "BB5", name: "Genie civil / Batiment" },
  ],
  SOUS_STATION: [
    { code: "BB1", name: "Echangeur et hydraulique" },
    { code: "BB2", name: "Regulation" },
    { code: "BB3", name: "Electricite" },
    { code: "BB4", name: "Raccordement reseau" },
  ],
  AUTRE: [],
};

// Categories de documents par defaut a l'interieur d'un lot, alignees sur le parcours reel
const LOT_DOCUMENT_CATEGORIES = [
  "RFP / RFQ",
  "Analyse des offres",
  "Contrat",
  "Plans / Fiche technique",
  "Permitting",
  "Reception / DIU",
  "Livrables",
];

const TEMPLATES = {
  RESEAU_CHALEUR: {
    tasks: [
      "Etude de trace et de dimensionnement du reseau",
      "Obtention des autorisations de voirie",
      "Terrassement et pose des canalisations",
      "Raccordement des sous-stations clientes",
      "Essais de pression et mise en eau",
      "Isolation et calorifugeage",
      "Mise en service et equilibrage hydraulique",
    ],
    documents: [...TRANSVERSE_DOCUMENTS],
  },
  GEOTHERMIE: {
    tasks: [
      "Etude de faisabilite geothermique",
      "Demande d'autorisation de forage",
      "Forage des sondes / puits",
      "Pose de la boucle geothermique",
      "Raccordement a la pompe a chaleur",
      "Tests de performance thermique",
      "Mise en service",
    ],
    documents: [...TRANSVERSE_DOCUMENTS],
  },
  CHAUFFERIE: {
    tasks: [
      "Etude de dimensionnement de la chaufferie",
      "Commande des equipements (chaudieres, pompes, ballons)",
      "Installation du genie civil",
      "Montage des equipements et tuyauteries",
      "Raccordements electriques et regulation",
      "Essais et mise en service",
      "Formation de l'exploitant",
    ],
    documents: [...TRANSVERSE_DOCUMENTS],
  },
  SOUS_STATION: {
    tasks: [
      "Visite technique du site client",
      "Dimensionnement de la sous-station",
      "Commande de l'echangeur et de la regulation",
      "Installation et raccordement au reseau",
      "Raccordement au circuit de chauffage client",
      "Parametrage de la regulation",
      "Mise en service et remise au client",
    ],
    documents: [...TRANSVERSE_DOCUMENTS],
  },
  AUTRE: {
    tasks: [],
    documents: COMMON_DOCUMENTS,
  },
};

function getTemplate(type) {
  return TEMPLATES[type] || TEMPLATES.AUTRE;
}

function getLotTemplate(type) {
  return LOT_TEMPLATES[type] || LOT_TEMPLATES.AUTRE;
}

module.exports = { getTemplate, getLotTemplate, TEMPLATES, LOT_TEMPLATES, LOT_DOCUMENT_CATEGORIES, TRANSVERSE_DOCUMENTS };
