// Extraction assistee par IA d'un devis / bon de commande / mail fournisseur pour pre-remplir un
// Contrat de sous-traitance KARNO : lit un fichier (PDF, image/photo, ou texte/CSV/mail colle) et
// en extrait les champs du contrat (identite du sous-traitant, montant, chantier, perimetre
// propose) via l'API Anthropic (meme mecanisme que quoteExtraction.js). Ne stocke jamais le
// contrat automatiquement : le resultat structure est renvoye au frontend pour relecture/
// correction avant creation effective du contrat (meme discipline "jamais d'ecriture auto, jamais
// de donnee inventee" que le reste de l'app).

const SUPPORTED_TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv", "message/rfc822"]);
const SUPPORTED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
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

function buildDocumentContentBlock({ buffer, mimetype, filename }) {
  if (mimetype === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
  }
  if (SUPPORTED_IMAGE_MIMES.has(mimetype)) {
    return { type: "image", source: { type: "base64", media_type: mimetype, data: buffer.toString("base64") } };
  }
  if (SUPPORTED_TEXT_MIMES.has(mimetype) || /\.(txt|csv|eml|msg)$/i.test(filename || "")) {
    const text = buffer.toString("utf8").slice(0, MAX_TEXT_CHARS);
    return { type: "text", text: `Contenu du fichier "${filename || "document"}" :\n\n${text}` };
  }
  return null;
}

async function extractContractInputData({ buffer, mimetype, filename }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "L'extraction IA n'est pas configuree sur ce serveur (variable ANTHROPIC_API_KEY manquante)."
    );
    err.statusCode = 503;
    throw err;
  }

  const block = buildDocumentContentBlock({ buffer, mimetype, filename });
  if (!block) {
    const err = new Error(
      "Format de fichier non pris en charge pour l'extraction automatique. Formats acceptes : PDF, image " +
        "(photo/scan), texte/mail colle en .txt, ou .csv. Pour un fichier Excel, exporte-le d'abord en PDF ou CSV."
    );
    err.statusCode = 415;
    throw err;
  }

  const system =
    "Tu extrais les donnees d'un devis, bon de commande ou mail fournisseur (chantier d'installation " +
    "energetique : reseau de chaleur, geothermie, chaufferie, sous-stations) pour pre-remplir un contrat " +
    "de sous-traitance KARNO. Lis attentivement le document fourni et appelle l'outil " +
    "record_contract_input_data avec ce que tu y trouves reellement. Ne calcule et n'invente jamais une " +
    "valeur absente du document (montant, date, identite) : omets le champ plutot que de deviner ou " +
    "d'estimer. Pour le perimetre (scope), deduis des postes concis a partir de la description des " +
    "travaux/fournitures, sans y ajouter de prestation non mentionnee. Reponds uniquement en appelant l'outil.";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 4096,
      system,
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "text",
              text: "Extrait les donnees de ce document via l'outil record_contract_input_data.",
            },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "record_contract_input_data" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Erreur API Anthropic (extraction contrat):", response.status, errText);
    const err = new Error("Erreur lors de l'appel a l'IA d'extraction. Reessaie dans un instant.");
    err.statusCode = 502;
    throw err;
  }

  const data = await response.json();
  const content = Array.isArray(data.content) ? data.content : [];
  const toolUse = content.find((b) => b.type === "tool_use" && b.name === "record_contract_input_data");
  if (!toolUse) {
    const err = new Error("L'IA n'a pas renvoye de resultat exploitable pour ce document.");
    err.statusCode = 502;
    throw err;
  }

  const input = toolUse.input || {};
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
