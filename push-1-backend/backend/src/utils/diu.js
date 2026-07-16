// Trame du Dossier d'Intervention Ulterieure (DIU) / as-built par lot (BB).
// Version 2 — reconstruite par retro-ingenierie du VRAI dossier DIU K-0044 (Drive
// "Dossier DIU" + sous-dossiers "5. Reception : DIU" de chaque BB) :
//   - plans as-built par phase (+ fusion) et resultats d'epreuves (BB3 Hydrogaz/Wanty)
//   - receptions par organisme agree : controle electrique RGIE (Electrotest),
//     checklist conformite GRD (ORES ST09)
//   - mises en service multi-pieces : lektest frigorifique, opstart, commissioning
//     report, work orders (Mitsubishi), MES degazeurs (Reflex Servitec)
//   - dossier constructeur (certificats CE, declarations de conformite usine)
//   - regulation : GEMMA / regulation generale, composition de modules, ladder,
//     liste de points
//   - autorisations : declaration classe 3 sondes (accuses DC3)
// Base legale : AR 25/01/2001 (art. 34-36) modifie par l'AR du 22/03/2006.

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

// Sections du DIU, dans l'ordre du dossier reel. Chaque document du lot est range dans la
// PREMIERE section dont le motif correspond (nom + nom de fichier + categorie).
const SECTIONS = [
  {
    id: "asbuilt",
    title: "Plans as-built et schemas conformes a l'execution",
    pattern: /as.?built|\bASB\b|plan global|trace|trac[eé]|implantation|boreholes|topo|georef|plan masse|merge|sch[eé]ma [eé]lectrique|PLA-ELE|sch[eé]ma de principe|PID|plan/i,
  },
  {
    id: "autorisations",
    title: "Autorisations et permitting (permis, declarations classe 3)",
    pattern: /\bDC3\b|classe 3|permis|permitting|urbanisme|PEB\b/i,
    categoryPattern: /Permitting/i,
  },
  {
    id: "receptions",
    title: "PV de reception, controles et organismes agrees",
    pattern: /RCPT|r[eé]ception|electrotest|electro.?test|RGIE|ST09|conformit[eé] ores|test de pression|testpression|\bTP\b|pression|[eé]preuve|TRT|forage test|\bPV\b|controle|CND|certibeau|KOP/i,
    categoryPattern: /Reception/i,
  },
  {
    id: "mes",
    title: "Mises en service (rapports, certificats, reglages)",
    pattern: /\bMES\b|MeS|mise en service|opstart|lektest|commissioning|WBD|work.?order|d[eé]gazeur|servitec|[eé]quilibrage/i,
  },
  {
    id: "regulation",
    title: "Regulation et supervision (GTC)",
    pattern: /r[eé]gulation|GEMMA|ladder|composition de module|liste de point|topologie|GTC|supervision|automate/i,
  },
  {
    id: "constructeur",
    title: "Dossier constructeur : fiches techniques, manuels, certificats CE",
    pattern: /\bFT\b|FT-|FT_|fiche|datasheet|notice|manuel|manual|Pdf_|PR17|OI_|CPX|CALPEX|POWER_FLEX|RECTOR|d[eé]claration.*conformit|conformity|marquage CE|CERTLOT|calcul/i,
    categoryPattern: /Fiche technique/i,
  },
  {
    id: "garanties",
    title: "Garanties, contrats et attestations",
    pattern: /garantie|warranty|contrat|CONV|attestation|homologation|agr[eé]ment|soudeur|carte PE|apave/i,
    categoryPattern: /Contrat/i,
  },
  {
    id: "autres",
    title: "Autres documents",
    pattern: /./,
  },
];

// Pieces attendues par type de lot — calquees sur les pieces REELLEMENT presentes dans le
// dossier DIU K-0044. Une exigence est OK si au moins un document du lot correspond ET a un fichier.
const REQUIRED_BY_LOT = {
  BB1: [
    { label: "Rapport TRT (test de reponse thermique)", pattern: /TRT/i },
    { label: "Rapport / protocole de forage (forage test et champ de sondes)", pattern: /forage/i },
    { label: "Plan d'implantation des sondes georeference (as-built)", pattern: /implantation|boreholes|georef|JODKARNO|releve/i },
    { label: "Tests de pression des liaisons horizontales (PV par champ de sondes)", pattern: /pression|testpression|\bTP\b/i },
    { label: "Plan as-built des liaisons horizontales enterrees", pattern: /liaisons|plan global|trac[eé]/i },
    { label: "Declaration classe 3 : accuses de reception (autorisation sondes)", pattern: /\bDC3\b|classe 3|accus[eé]/i },
    { label: "PV de reception des travaux de forage", pattern: /r[eé]ception|RCPT|\bPV\b/i },
  ],
  BB2: [
    { label: "Schema de principe de la chaufferie (as-built)", pattern: /sch[eé]ma de principe/i },
    { label: "Schema electrique de la chaufferie (as-built)", pattern: /sch[eé]ma [eé]lectrique|PLA-ELE/i },
    { label: "Plan d'implantation chaufferie", pattern: /implantation/i },
    { label: "MES PAC : rapport de mise en service (commissioning report)", pattern: /commissioning|opstart|MES.?PAC/i },
    { label: "MES PAC : certificat d'etancheite frigorifique (lektest)", pattern: /lektest|[eé]tanch[eé]it[eé] frigo/i },
    { label: "MES degazeurs / vases (Servitec ou equivalent)", pattern: /d[eé]gazeur|servitec/i },
    { label: "Reception electrique par organisme agree (RGIE)", pattern: /electrotest|electro.?test|RGIE|r[eé]ception [eé]le/i },
    { label: "Dossier constructeur PAC (certificats CE, declarations de conformite)", pattern: /conformit|conformity|CERTLOT|CE.?declaration/i },
    { label: "Fiches techniques hydrauliques (vases, echangeurs, circulateurs...)", pattern: /reflex|echangeur|circulateur|vase|purgeur/i },
    { label: "Notes de calcul (vases d'expansion...)", pattern: /calcul/i },
  ],
  BB3: [
    { label: "Plan as-built du reseau — phase(s) et fusion des phases", pattern: /as.?built|\bASB\b|merge/i },
    { label: "Dossier as-built du sous-traitant reseau (avec resultats d'epreuves)", pattern: /dossier.?as.?built|[eé]preuve/i },
    { label: "Tests de pression du reseau (PV signes)", pattern: /pression|\bTP\b|RCPT/i },
    { label: "Fiche technique des tubes pre-isoles (CALPEX / LOGSTOR...)", pattern: /CALPEX|CPX|LOGSTOR|tube/i },
    { label: "Notices de montage / piquage / manchonnage", pattern: /notice|montage|piquage|[eé]crase|manchon/i },
    { label: "Certificats et homologations soudeurs", pattern: /soudeur|soudure|carte PE|apave|homologation/i },
  ],
  BB4: [
    { label: "Plans as-built des tranchees / terrassements", pattern: /plan|trac[eé]|as.?built/i },
    { label: "Essais de compactage", pattern: /compactage/i },
  ],
  BB5: [
    { label: "Fiche technique sous-station / HIU", pattern: /sous.?station|HIU|R589/i },
    { label: "Fiche technique et manuel booster ECS", pattern: /booster|HPWB/i },
    { label: "Schema des raccordements electriques HIU", pattern: /raccordement.*[eé]lectrique|[eé]lectrique/i },
    { label: "Manuel pressostat / securites", pattern: /pressostat/i },
    { label: "Notice des compteurs d'energie", pattern: /compteur|OI_PSM|kamstrup/i },
    { label: "Checklist de reception par maison (KOP / avant reception)", pattern: /KOP|check.?list.*r[eé]ception|r[eé]ception.*maison/i },
    { label: "PID hydraulique HIU", pattern: /PID/i },
  ],
  BB6: [
    { label: "Regulation generale / GEMMA", pattern: /GEMMA|r[eé]gulation g[eé]n[eé]rale/i },
    { label: "Composition des modules de regulation", pattern: /composition|module/i },
    { label: "Programme automate (ladder) / liste de points", pattern: /ladder|liste de point/i },
    { label: "Topologie du bus / supervision", pattern: /topologie|supervision/i },
  ],
  BB7: [
    { label: "Dossier technique electrique approuve", pattern: /dossier technique/i },
    { label: "Reception de la cabine par organisme agree (RGIE)", pattern: /electrotest|electro.?test|r[eé]ception cabine|RGIE/i },
    { label: "Checklist de conformite GRD (ORES ST09 ou equivalent)", pattern: /ST09|conformit[eé].*ores|ores.*conformit/i },
    { label: "Fiches techniques cables / alimentation", pattern: /POWER_FLEX|cable|c[aâ]ble/i },
    { label: "Schemas / plans electriques as-built", pattern: /sch[eé]ma|plan/i },
  ],
  BB8: [
    { label: "Plans du batiment (Energy Center) as-built", pattern: /plan|implantation/i },
    { label: "Fiches techniques materiaux", pattern: /RECTOR|porte|mat[eé]riaux|PPLVN|fiche/i },
    { label: "PV de reception architecte", pattern: /\bPV\b|architecte|AAUM|MJQ|RP/i },
    { label: "Rapport PEB", pattern: /PEB/i },
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
