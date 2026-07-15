// Extraction assistee par IA (Gemini) d'un devis / bon de commande / mail fournisseur pour
// pre-remplir un Contrat de sous-traitance KARNO : lit un fichier (PDF, image/photo, ou
// texte/CSV/mail colle) et en extrait les champs du contrat (identite du sous-traitant, montant,
// chantier, perimetre propose). Ne stocke jamais le contrat automatiquement : le resultat
// structure est renvoye au frontend pour relecture/correction avant creation effective du contrat
// (meme discipline "jamais d'ecriture auto, jamais de donnee inventee" que le reste de l'app).

const { buildFilePart, callGeminiToolOnce } = require("./geminiClient");

const SUPPORTED_TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv", "message/rfc822"]);
const MAX_TEXT_CHARS = 60000;

const TOOL = {
  name: "record_contract_input_data",
  description:
    "Enregistre les informations extraites d'un devis, bon de commande ou mail fournisseur, en vue de " +
    "pre-remplir un contrat de sous-traitance. N'invente jamais une valeur absente du document : omets " +
    "le champ correspondant plutot que de deviner.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        enum: ["devis", "bon_de_commande", "email", "autre"],
        description: "Nature du document fourni.",
      },
      subcontractor: {
        type: "object",
        description: "Identite de l'entreprise sous-traitante/fournisseur emettant le document.",
        properties: {
          name: { type: "string", description: "Raison sociale du sous-traitant." },
          address: { type: "string", description: "Adresse du siege social, si mentionnee." },
          vatNumber: { type: "string", description: "Numero d'entreprise / TVA (BCE), si mentionne." },
          specialty: { type: "string", description: "Specialite/metier du sous-traitant deductible du document (ex: Soudure PEHD, Forage dirige)." },
          representative: { type: "string", description: "Representant legal / gerant, si mentionne." },
          contactName: { type: "string", description: "Nom de la personne de contact chez le sous-traitant." },
          contactEmail: { type: "string", description: "Email de contact, si mentionne." },
          contactPhone: { type: "string", description: "Telephone de contact, si mentionne." },
        },
      },
      montantForfaitaire: {
        type: "number",
        description: "Montant total HTVA du devis/BC en euros, si un montant global/forfaitaire est identifiable. N'additionne pas des postes toi-meme si le total n'est pas explicite.",
      },
      referenceChantier: { type: "string", description: "Reference ou intitule du chantier/projet mentionne dans le document, si present." },
      adresseChantier: { type: "string", description: "Adresse du chantier, si mentionnee (distincte de l'adresse du siege du sous-traitant)." },
      dateDebut: { type: "string", description: "Date de debut des travaux, si mentionnee (format JJ/MM/AAAA)." },
      dureePrevisionnelle: { type: "string", description: "Duree previsionnelle des travaux, si mentionnee (ex: '15 jours ouvres')." },
      dateFin: { type: "string", description: "Date de fin prevue, si mentionnee (format JJ/MM/AAAA)." },
      scope: {
        type: "array",
        description: "Proposition de postes de perimetre (prestations) deduits de la description des travaux/produits dans le document, dans l'ordre ou ils apparaissent.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Intitule du poste de prestation, concis." },
            commentaire: { type: "string", description: "Precision utile (quantite, condition, exclusion...) si mentionnee (optionnel)." },
          },
          required: ["label"],
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Ambiguites, mentions illisibles, ou informations importantes manquantes remarquees (optionnel, en francais).",
      },
    },
    required: ["documentType"],
  },
};

// Instructions systeme enrichies d'un glossaire metier et d'exemples concrets KARNO (reseaux de
// chaleur/geothermie/chaufferie), pour ameliorer la qualite de l'extraction sans recourir a un
// fine-tuning (non pertinent pour ce volume/cas d'usage) : le levier qui compte reellement ici est
// un prompt precis, avec du contexte metier et des exemples de bonnes/mauvaises extractions.
const SYSTEM_INSTRUCTION = `Tu extrais les donnees d'un devis, bon de commande ou mail fournisseur pour pre-remplir un contrat de sous-traitance chez KARNO, une entreprise qui developpe et construit des reseaux de chaleur, installations geothermiques et chaufferies collectives en Belgique.

Glossaire metier (pour reconnaitre les postes de perimetre correctement, meme si le devis utilise un vocabulaire different) :
- BB (Building Block) : lot technique d'un projet (ex: BB1 = geothermie/forage, BB2 = chaufferie, BB3 = reseau enterre, BB4 = techniques batiment/skid, BB5 = sous-stations clientes).
- PEHD, PEX, Terrendis, Acier : materiaux de canalisation de reseau de chaleur enterre.
- HIU (Heat Interface Unit) : sous-station compacte cote client, echangeur + regulation.
- Skid : sous-station ou module technique prefabrique en usine, livre assemble.
- CND : controle non destructif (radiographie, ultrasons) sur soudures.
- DIU : Dossier d'Intervention Ulterieure (document de securite obligatoire en Belgique).
- BCE : numero d'entreprise belge (equivalent SIRET), format 4 groupes de chiffres.
- Qualiroute : cahier des charges type wallon pour la refection de voirie.

Exemples de bonne pratique :
- Un devis mentionnant "Soudure PEHD OD200, y compris controle visuel" -> poste de perimetre : {label: "Soudures PEHD OD200", commentaire: "Y compris controle visuel"}. Ne pas inventer un controle CND si non mentionne.
- Un devis avec un total "Total general HTVA : 24.500 EUR" -> montantForfaitaire = 24500. Un devis avec seulement des prix unitaires par poste sans total explicite -> ne pas remplir montantForfaitaire (ne jamais additionner soi-meme les postes, une remise ou un forfait degressif peut s'appliquer).
- Un mail disant "Bonjour, voici notre offre pour le chantier K-0061 a Namur" -> referenceChantier = "K-0061", adresseChantier = "Namur" (ou plus precis si une adresse complete est donnee).
- Une mention manuscrite illisible ou un montant barre/corrige -> le signaler dans warnings plutot que de deviner lequel des deux montants est le bon.

Lis attentivement le document fourni et appelle l'outil record_contract_input_data avec ce que tu y trouves reellement. Ne calcule et n'invente jamais une valeur absente du document (montant, date, identite) : omets le champ plutot que de deviner ou d'estimer. Reponds uniquement en appelant l'outil.`;

async function extractContractInputData({ buffer, mimetype, filename }) {
  const filePart = buildFilePart({ buffer, mimetype, filename, textMimes: SUPPORTED_TEXT_MIMES, maxTextChars: MAX_TEXT_CHARS });
  if (!filePart) {
    const err = new Error(
      "Format de fichier non pris en charge pour l'extraction automatique. Formats acceptes : PDF, image " +
        "(photo/scan), texte/mail colle en .txt, ou .csv. Pour un fichier Excel, exporte-le d'abord en PDF ou CSV."
    );
    err.statusCode = 415;
    throw err;
  }

  const userParts = [filePart, { text: "Extrait les donnees de ce document via l'outil record_contract_input_data." }];

  const input = await callGeminiToolOnce({ systemInstruction: SYSTEM_INSTRUCTION, userParts, tool: TOOL });

  const sub = input.subcontractor || {};
  const scope = Array.isArray(input.scope) ? input.scope : [];

  return {
    documentType: input.documentType || "autre",
    fields: {
      ST_NOM: sub.name || "",
      ST_ADRESSE: sub.address || "",
      ST_BCE: sub.vatNumber || "",
      ST_SPECIALITE: sub.specialty || "",
      ST_CEO_NOM: sub.representative || "",
      ST_CONTACT1_NOM: sub.contactName || "",
      ST_CONTACT1_EMAIL: sub.contactEmail || "",
      ST_CONTACT1_TEL: sub.contactPhone || "",
      MONTANT_FORFAIT: typeof input.montantForfaitaire === "number" && Number.isFinite(input.montantForfaitaire)
        ? String(input.montantForfaitaire)
        : "",
      REFERENCE_CHANTIER: input.referenceChantier || "",
      ADRESSE_CHANTIER: input.adresseChantier || "",
      DATE_DEBUT: input.dateDebut || "",
      DUREE_PREVISIONNELLE: input.dureePrevisionnelle || "",
      DATE_FIN: input.dateFin || "",
    },
    scope: scope
      .filter((s) => s && s.label)
      .map((s) => ({ label: String(s.label), inclus: true, commentaire: s.commentaire || "" })),
    warnings: Array.isArray(input.warnings) ? input.warnings.filter(Boolean).map(String) : [],
  };
}

module.exports = { extractContractInputData };
