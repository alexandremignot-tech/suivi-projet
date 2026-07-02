// Templates de checklist (taches + documents attendus) par type de projet.
// Appliques automatiquement a la creation d'un projet pour demarrer avec une base adaptee au metier.

const COMMON_DOCUMENTS = [
  { name: "PV de reception des travaux", category: "PV de reception" },
  { name: "Manuel d'exploitation et de maintenance", category: "Manuel d'exploitation" },
  { name: "Garanties constructeur", category: "Garantie constructeur" },
  { name: "Notice de securite / consignes", category: "Notice de securite" },
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
    documents: [
      { name: "Plan As-built du trace de reseau", category: "Plan As-built" },
      { name: "Certificat de conformite des soudures", category: "Certificat de conformite" },
      { name: "Rapport d'essais de pression", category: "Autre" },
      ...COMMON_DOCUMENTS,
    ],
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
    documents: [
      { name: "Rapport de forage geotechnique", category: "Autre" },
      { name: "Plan As-built des sondes/puits", category: "Plan As-built" },
      { name: "Certificat de conformite forage", category: "Certificat de conformite" },
      ...COMMON_DOCUMENTS,
    ],
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
    documents: [
      { name: "Plan As-built de la chaufferie", category: "Plan As-built" },
      { name: "Certificat de conformite gaz/combustible", category: "Certificat de conformite" },
      { name: "Fiches techniques des equipements", category: "Fiche technique" },
      ...COMMON_DOCUMENTS,
    ],
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
    documents: [
      { name: "Plan As-built de la sous-station", category: "Plan As-built" },
      { name: "Fiche technique de l'echangeur", category: "Fiche technique" },
      { name: "PV de mise en service", category: "PV de reception" },
      ...COMMON_DOCUMENTS,
    ],
  },
  AUTRE: {
    tasks: [],
    documents: COMMON_DOCUMENTS,
  },
};

function getTemplate(type) {
  return TEMPLATES[type] || TEMPLATES.AUTRE;
}

module.exports = { getTemplate, TEMPLATES };
