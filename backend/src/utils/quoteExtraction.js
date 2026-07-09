// Extraction assistee par IA d'un devis fournisseur (comparateur d'offres de prix) : lit un
// fichier (PDF, image/photo, ou texte/CSV) et en extrait une liste structuree de postes/prix via
// l'API Anthropic (meme mecanisme que aiAssistant.js). Ne stocke jamais le fichier source : le
// resultat structure est renvoye au frontend, qui laisse l'utilisateur relire/corriger avant
// d'enregistrer quoi que ce soit dans la comparaison (aucune ecriture automatique en base ici).

const SUPPORTED_TEXT_MIMES = new Set(["text/plain", "text/csv", "application/csv"]);
const SUPPORTED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
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

function buildDocumentContentBlock({ buffer, mimetype, filename }) {
  if (mimetype === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") } };
  }
  if (SUPPORTED_IMAGE_MIMES.has(mimetype)) {
    return { type: "image", source: { type: "base64", media_type: mimetype, data: buffer.toString("base64") } };
  }
  if (SUPPORTED_TEXT_MIMES.has(mimetype) || /\.(txt|csv)$/i.test(filename || "")) {
    const text = buffer.toString("utf8").slice(0, MAX_TEXT_CHARS);
    return { type: "text", text: `Contenu du fichier "${filename || "devis"}" :\n\n${text}` };
  }
  return null;
}

async function extractQuoteLineItems({ buffer, mimetype, filename }) {
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
        "(photo/scan du devis), texte ou CSV. Pour un fichier Excel, exporte-le d'abord en PDF ou CSV."
    );
    err.statusCode = 415;
    throw err;
  }

  const system =
    "Tu extrais les donnees d'un devis fournisseur (chantier d'installation energetique : reseau de " +
    "chaleur, geothermie, chaufferie, sous-stations) pour alimenter un comparateur d'offres. Lis " +
    "attentivement le document fourni et appelle l'outil record_quote_line_items avec ce que tu y trouves " +
    "reellement. Ne calcule jamais un montant qui n'est pas explicitement dans le document, et n'arrondis " +
    "pas de maniere trompeuse. Si un poste n'a pas de prix individuel (ex: inclus dans un forfait global), " +
    "omets le champ amount plutot que d'inventer une repartition. Reponds uniquement en appelant l'outil.";

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
              text: "Extrait les postes chiffres de ce devis via l'outil record_quote_line_items.",
            },
          ],
        },
      ],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "record_quote_line_items" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Erreur API Anthropic (extraction devis):", response.status, errText);
    const err = new Error("Erreur lors de l'appel a l'IA d'extraction. Reessaie dans un instant.");
    err.statusCode = 502;
    throw err;
  }

  const data = await response.json();
  const content = Array.isArray(data.content) ? data.content : [];
  const toolUse = content.find((b) => b.type === "tool_use" && b.name === "record_quote_line_items");
  if (!toolUse) {
    const err = new Error("L'IA n'a pas renvoye de resultat exploitable pour ce document.");
    err.statusCode = 502;
    throw err;
  }

  const input = toolUse.input || {};
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
