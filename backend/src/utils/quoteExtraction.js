// Extraction assistee par IA (Gemini) d'un devis fournisseur (comparateur d'offres de prix) : lit
// un fichier (PDF, image/photo, ou texte/CSV) et en extrait une liste structuree de postes/prix.
// Ne stocke jamais le fichier source : le resultat structure est renvoye au frontend, qui laisse
// l'utilisateur relire/corriger avant d'enregistrer quoi que ce soit dans la comparaison (aucune
// ecriture automatique en base ici).

const { buildFilePart, callGeminiToolOnce } = require("./geminiClient");

const SUPPORTED_TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv"]);
const MAX_TEXT_CHARS = 60000; // marge large pour un devis, evite un prompt demesure sur un fichier texte enorme

const TOOL = {
  name: "record_quote_line_items",
  description:
    "Enregistre les informations extraites d'un devis fournisseur : postes chiffres, et metadonnees " +
    "de l'offre si elles sont mentionnees (nom du fournisseur, validite, delai, garantie). N'invente " +
    "jamais un montant absent du document : omets le champ 'amount' pour les postes non chiffres.",
  input_schema: {
    type: "object",
    properties: {
      offerName: {
        type: "string",
        description: "Nom du fournisseur/entreprise emettant le devis, si identifiable dans le document.",
      },
      validityDays: {
        type: "integer",
        description: "Duree de validite de l'offre, en jours, si mentionnee (ex: 'valable 30 jours' -> 30).",
      },
      deliveryWeeks: {
        type: "number",
        description: "Delai de livraison/execution annonce, en semaines, si mentionne.",
      },
      warrantyMonths: {
        type: "integer",
        description: "Duree de garantie, en mois, si mentionnee (convertis les annees en mois).",
      },
      lineItems: {
        type: "array",
        description: "Postes du devis, dans l'ordre ou ils apparaissent dans le document.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Intitule du poste, tel que redige dans le devis (concis)." },
            amount: {
              type: "number",
              description: "Montant HTVA en euros pour ce poste. Omets ce champ si le poste n'est pas chiffre individuellement.",
            },
            note: {
              type: "string",
              description: "Precision utile (unite, exclusion, condition...) si le devis en mentionne une (optionnel).",
            },
          },
          required: ["label"],
        },
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description:
          "Ambiguites, mentions manuscrites illisibles, ou informations importantes manquantes remarquees " +
          "dans le document (optionnel, en francais).",
      },
    },
    required: ["lineItems"],
  },
};

// Instructions systeme enrichies d'un glossaire metier KARNO (reseaux de chaleur / geothermie /
// chaufferie / sous-stations) et d'exemples concrets, pour ameliorer la fiabilite de l'extraction :
// un prompt precis avec contexte metier et exemples vaut mieux qu'un fine-tuning pour ce cas d'usage.
const SYSTEM_INSTRUCTION = `Tu extrais les donnees d'un devis fournisseur pour alimenter un comparateur d'offres chez KARNO, une entreprise qui developpe et construit des reseaux de chaleur, installations geothermiques et chaufferies collectives en Belgique.

Glossaire metier (pour reconnaitre les postes correctement, meme si le devis utilise un vocabulaire different) :
- BB (Building Block) : lot technique d'un projet (ex: BB1 = geothermie/forage, BB2 = chaufferie, BB3 = reseau enterre, BB4 = techniques batiment/skid, BB5 = sous-stations clientes).
- PEHD, PEX, Terrendis, Acier : materiaux de canalisation de reseau de chaleur enterre.
- HIU (Heat Interface Unit) : sous-station compacte cote client, echangeur + regulation.
- Skid : sous-station ou module technique prefabrique en usine, livre assemble.
- CND : controle non destructif (radiographie, ultrasons) sur soudures.

Exemples de bonne pratique :
- Un devis avec un poste "Fourniture et pose PAC geothermique 30kW - 18.500 EUR" -> {label: "Fourniture et pose PAC geothermique 30kW", amount: 18500}.
- Un devis dont un poste dit "inclus dans le forfait chantier" sans prix individuel -> ne pas remplir amount pour ce poste (l'omettre plutot que de deviner une repartition).
- Une remise globale ou un rabais en bas de devis ne doit pas etre reparti poste par poste : le signaler dans warnings si pertinent plutot que de l'appliquer toi-meme a un poste au hasard.

Lis attentivement le document fourni et appelle l'outil record_quote_line_items avec ce que tu y trouves reellement. Ne calcule jamais un montant qui n'est pas explicitement dans le document, et n'arrondis pas de maniere trompeuse. Reponds uniquement en appelant l'outil.`;

async function extractQuoteLineItems({ buffer, mimetype, filename }) {
  const filePart = buildFilePart({ buffer, mimetype, filename, textMimes: SUPPORTED_TEXT_MIMES, maxTextChars: MAX_TEXT_CHARS });
  if (!filePart) {
    const err = new Error(
      "Format de fichier non pris en charge pour l'extraction automatique. Formats acceptes : PDF, image " +
        "(photo/scan du devis), texte ou CSV. Pour un fichier Excel, exporte-le d'abord en PDF ou CSV."
    );
    err.statusCode = 415;
    throw err;
  }

  const userParts = [filePart, { text: "Extrait les postes chiffres de ce devis via l'outil record_quote_line_items." }];

  const input = await callGeminiToolOnce({ systemInstruction: SYSTEM_INSTRUCTION, userParts, tool: TOOL });

  const lineItems = Array.isArray(input.lineItems) ? input.lineItems : [];
  return {
    offerName: input.offerName || "",
    validityDays: input.validityDays ?? null,
    deliveryWeeks: input.deliveryWeeks ?? null,
    warrantyMonths: input.warrantyMonths ?? null,
    lineItems: lineItems
      .filter((li) => li && li.label)
      .map((li) => ({
        label: String(li.label),
        amount: typeof li.amount === "number" && Number.isFinite(li.amount) ? li.amount : null,
        note: li.note || "",
      })),
    warnings: Array.isArray(input.warnings) ? input.warnings.filter(Boolean).map(String) : [],
  };
}

module.exports = { extractQuoteLineItems };
