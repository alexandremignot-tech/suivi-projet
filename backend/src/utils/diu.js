// Trame du Dossier d'Intervention Ulterieure (DIU) / as-built par lot (BB).
// Base legale : AR du 25/01/2001 (chantiers temporaires ou mobiles), art. 34-36,
// modifie par l'AR du 22/03/2006. Complete par les pratiques metier :
// geothermie (ADEME/BRGM, VDI 4640), commissionnement chaufferie (Cegibat),
// DOE reseaux de chaleur, installations HVAC.

const LEGAL_NOTICE = [
  "Ce dossier constitue le Dossier d'Intervention Ulterieure (DIU) du lot concerne, au sens de",
  "l'arrete royal du 25 janvier 2001 concernant les chantiers temporaires ou mobiles (art. 34-36),",
  "modifie par l'arrete royal du 22 mars 2006.",
  "",
  "Il contient les elements utiles en matiere de securite et de sante a prendre en compte lors de",
  "travaux ulterieurs eventuels (entretien, reparation, remplacement, demontage, renovation) :",
  "- les plans conformes a l'execution et a la realisation effective des ouvrages ;",
  "- la nature et l'emplacement des dangers decelables ou caches, notamment les conduites et",
  "  reseaux enterres ou encastres (reseau de chaleur, liaisons geothermiques, cables) ;",
  "- les elements architecturaux, techniques et organisationnels utiles a l'entretien ;",
  "- les informations destinees aux personnes qui executeront des travaux ulterieurs.",
  "",
  "Ce dossier doit etre conserve par le maitre d'ouvrage et transmis a tout nouveau proprietaire",
  "ou a tout intervenant ulterieur. Toute intervention sur les installations decrites doit etre",
  "precedee de la consultation du present dossier, en particulier des plans de reseaux enterres.",
];

// Sections generiques du DIU : chaque document du lot est range dans la PREMIERE section
// dont le motif correspond (nom + categorie). Les non-ranges vont dans "Autres documents".
const SECTIONS = [
  {
    id: "plans",
    title: "Plans conformes a l'execution (as-built)",
    pattern: /plan|implantation|trace|trac[eé]|topo|georef|boreholes|PID|sch[eé]ma|layout/i,
  },
  {
    id: "tests",
    title: "PV de reception, tests et mises en service",
    pattern: /test|pression|\bTP\b|TRT|\bMES\b|MeS|\bPV\b|r[eé]ception|RCPT|commissioning|opstart|lektest|WBD|forage test|DIU/i,
    categoryPattern: /Reception/i,
  },
  {
    id: "fiches",
    title: "Fiches techniques, notices et manuels",
    pattern: /\bFT\b|FT-|FT_|fiche|datasheet|notice|manuel|manual|Pdf_|PR17|OI_|CPX|POWER_FLEX|RECTOR|calcul/i,
    categoryPattern: /Fiche technique/i,
  },
  {
    id: "garanties",
    title: "Garanties, contrats et attestations",
    pattern: /garantie|warranty|contrat|CONV|attestation|certificat|homologation|agr[eé]ment/i,
  },
  {
    id: "autres",
    title: "Autres documents",
    pattern: /./,
  },
];

// Pieces attendues par type de lot (checklist de completude du DIU).
// Chaque exigence est validee si au moins un document du lot correspond au motif.
const REQUIRED_BY_LOT = {
  BB1: [
    { label: "Rapport TRT (test de reponse thermique)", pattern: /TRT/i },
    { label: "Protocole / rapport de forage", pattern: /forage/i },
    { label: "Plan d'implantation des sondes (georeference)", pattern: /implantation|boreholes|georef|JODKARNO/i },
    { label: "Tests de pression des liaisons horizontales", pattern: /pression|testpression|\bTP\b/i },
    { label: "Plan des liaisons horizontales enterrees", pattern: /liaisons|plan global/i },
  ],
  BB2: [
    { label: "Schema de principe de la chaufferie", pattern: /sch[eé]ma de principe/i },
    { label: "Plan d'implantation chaufferie", pattern: /implantation/i },
    { label: "PV de mise en service PAC", pattern: /\bMES\b|MeS|opstart|commissioning/i },
    { label: "Fiche technique PAC", pattern: /PAC|FX-W/i },
    { label: "Notes de calcul (vases d'expansion...)", pattern: /calcul/i },
    { label: "Fiches techniques hydrauliques (vases, echangeurs, circulateurs...)", pattern: /reflex|echangeur|circulateur|vase/i },
  ],
  BB3: [
    { label: "Plan de trace du reseau as-built", pattern: /plan global|trac[eé]|r[eé]seau/i },
    { label: "Tests de pression du reseau", pattern: /pression|\bTP\b/i },
    { label: "Fiche technique des tubes (CALPEX...)", pattern: /CALPEX|CPX|tube/i },
    { label: "Notices de montage / piquage", pattern: /notice|montage|piquage|[eé]crase/i },
    { label: "Certificats soudeurs", pattern: /soudeur|soudure|PE |homologation/i },
  ],
  BB4: [
    { label: "Plans des liaisons / terrassements", pattern: /plan|trac[eé]/i },
  ],
  BB5: [
    { label: "Fiche technique sous-station / HIU", pattern: /sous.?station|HIU|R589/i },
    { label: "Fiche technique et manuel booster", pattern: /booster|HPWB/i },
    { label: "PID hydraulique HIU", pattern: /PID/i },
    { label: "Raccordements electriques HIU", pattern: /raccordement.*[eé]lectrique|[eé]lectrique/i },
    { label: "Notice compteurs d'energie", pattern: /compteur|OI_PSM|kamstrup/i },
    { label: "Manuel pressostat", pattern: /pressostat/i },
  ],
  BB6: [
    { label: "Topologie de la regulation", pattern: /topologie/i },
    { label: "Composition des modules de regulation", pattern: /composition|module/i },
    { label: "Liste de points de regulation", pattern: /liste de point/i },
  ],
  BB7: [
    { label: "Dossier technique electrique approuve", pattern: /dossier technique/i },
    { label: "Fiche technique cables / alimentation", pattern: /POWER_FLEX|cable|c[aâ]ble/i },
    { label: "Schemas / plans electriques", pattern: /sch[eé]ma|plan/i },
  ],
  BB8: [
    { label: "Plans du batiment (Energy Center)", pattern: /plan|implantation/i },
    { label: "Fiches techniques materiaux", pattern: /RECTOR|porte|mat[eé]riaux|PPLVN|fiche/i },
    { label: "PV / documents architecte", pattern: /\bPV\b|architecte|AAUM|MJQ/i },
  ],
};

function docText(doc) {
  return `${doc.name || ""} ${doc.fileName || ""}`;
}

// Construit la structure complete du DIU d'un lot : sections avec documents ranges,
// checklist de completude, inventaires (equipements, unites/maisons), contacts.
function buildDiuData({ lot, project, documents, equipments, units }) {
  const lotDocs = documents.filter((d) => d.lotId === lot.id);

  const sections = SECTIONS.map((s) => ({ id: s.id, title: s.title, docs: [] }));
  for (const doc of lotDocs) {
    const target =
      SECTIONS.find(
        (s) =>
          (s.categoryPattern && s.categoryPattern.test(doc.category || "")) ||
          s.pattern.test(docText(doc))
      ) || SECTIONS[SECTIONS.length - 1];
    sections.find((s) => s.id === target.id).docs.push(doc);
  }

  const required = (REQUIRED_BY_LOT[lot.code] || []).map((r) => {
    const matches = lotDocs.filter((d) => r.pattern.test(docText(d)));
    const withFile = matches.filter((d) => d.fileUrl);
    return {
      label: r.label,
      status: withFile.length > 0 ? "OK" : matches.length > 0 ? "SANS_FICHIER" : "MANQUANT",
      docs: matches.map((d) => ({ id: d.id, name: d.name, fileUrl: d.fileUrl })),
    };
  });

  const okCount = required.filter((r) => r.status === "OK").length;

  return {
    lot: { id: lot.id, code: lot.code, name: lot.name },
    project: { id: project.id, name: project.name, description: project.description },
    subcontractor: lot.subcontractor
      ? {
          name: lot.subcontractor.name,
          specialty: lot.subcontractor.specialty,
          contactName: lot.subcontractor.contactName,
          email: lot.subcontractor.email,
          phone: lot.subcontractor.phone,
        }
      : null,
    legalNotice: LEGAL_NOTICE,
    sections: sections.filter((s) => s.docs.length > 0 || s.id !== "autres"),
    required,
    completeness: required.length ? Math.round((okCount / required.length) * 100) : null,
    equipments: (equipments || [])
      .filter((e) => e.lotId === lot.id)
      .map((e) => ({
        name: e.name,
        category: e.category,
        manufacturer: e.manufacturer,
        quantity: e.quantity,
        location: e.location,
        specs: e.specs || [],
        maintenanceIntervalDays: e.maintenanceIntervalDays,
        lastMaintenanceDate: e.lastMaintenanceDate,
      })),
    units: (units || []).map((u) => ({ name: u.name, specs: u.specs || [] })),
  };
}

module.exports = { buildDiuData, LEGAL_NOTICE };
