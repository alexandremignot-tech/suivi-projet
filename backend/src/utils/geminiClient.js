// Client partage pour les appels a l'API Gemini (Google) en mode "function calling force" :
// utilise par contractExtraction.js, quoteExtraction.js et aiAssistant.js pour obtenir une reponse
// structuree (JSON) plutot que du texte libre, de la meme maniere que le tool-use d'Anthropic
// utilise auparavant. Cle lue depuis GEMINI_API_KEY (console : https://aistudio.google.com/apikey).
//
// Reference API utilisee (REST, generateContent) : endpoint, toolConfig.functionCallingConfig avec
// mode "ANY" + allowedFunctionNames pour forcer l'appel d'une fonction precise, parts inlineData
// (mimeType/data base64) pour les fichiers, roles "user"/"model"/"function" pour le multi-tour.

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Convertit recursivement un schema de type Anthropic (type en minuscules : "object", "string",
// "number", "integer", "array", "boolean") vers le format attendu par Gemini (Type enum en
// MAJUSCULES). Permet de reutiliser des schemas d'outils ecrits une seule fois.
function toGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  const out = { ...schema };
  if (typeof out.type === "string") out.type = out.type.toUpperCase();
  if (out.properties) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (out.items) out.items = toGeminiSchema(out.items);
  return out;
}

function missingKeyError() {
  const err = new Error(
    "L'extraction IA n'est pas configuree sur ce serveur (variable GEMINI_API_KEY manquante)."
  );
  err.statusCode = 503;
  return err;
}

// Construit une part Gemini a partir d'un fichier (PDF, image, ou texte/CSV/mail deja decode).
// Pour le texte, on l'injecte directement comme part "text" (pas de fichier binaire a encoder).
function buildFilePart({ buffer, mimetype, filename, textMimes, maxTextChars }) {
  const SUPPORTED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/heic", "image/heif"]);
  if (mimetype === "application/pdf") {
    return { inlineData: { mimeType: "application/pdf", data: buffer.toString("base64") } };
  }
  if (SUPPORTED_IMAGE_MIMES.has(mimetype)) {
    return { inlineData: { mimeType: mimetype, data: buffer.toString("base64") } };
  }
  if ((textMimes && textMimes.has(mimetype)) || /\.(txt|csv|eml|msg)$/i.test(filename || "")) {
    const text = buffer.toString("utf8").slice(0, maxTextChars || 60000);
    return { text: `Contenu du fichier "${filename || "document"}" :\n\n${text}` };
  }
  return null;
}

// Appel generique a generateContent. Renvoie le tableau `parts` brut de la reponse (chaque part
// est soit { text }, soit { functionCall: { name, args } }) : a l'appelant d'interpreter selon son
// cas d'usage (extraction forcee mono-outil, ou chat libre avec outils optionnels).
async function callGemini({ systemInstruction, contents, tools, toolConfig, model, maxOutputTokens }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw missingKeyError();

  const body = { contents };
  if (systemInstruction) body.systemInstruction = { parts: [{ text: systemInstruction }] };
  if (tools) body.tools = tools;
  if (toolConfig) body.toolConfig = toolConfig;
  if (maxOutputTokens) body.generationConfig = { maxOutputTokens };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model || DEFAULT_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    console.error("Erreur API Gemini:", response.status, errText);
    const err = new Error("Erreur lors de l'appel a l'IA. Reessaie dans un instant.");
    err.statusCode = 502;
    throw err;
  }

  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts || [];
}

// Appelle generateContent en forcant l'appel de la fonction `tool.name`, et renvoie directement
// les arguments (`args`) que le modele a produits pour cette fonction. `userParts` est un tableau
// de parts utilisateur (texte + fichier eventuel) pour un appel simple, mono-tour.
async function callGeminiToolOnce({ systemInstruction, userParts, tool, model }) {
  const parts = await callGemini({
    systemInstruction,
    contents: [{ role: "user", parts: userParts }],
    tools: [{ functionDeclarations: [{ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.input_schema) }] }],
    toolConfig: { functionCallingConfig: { mode: "ANY", allowedFunctionNames: [tool.name] } },
    model,
  });
  const callPart = parts.find((p) => p.functionCall && p.functionCall.name === tool.name);
  if (!callPart) {
    const err = new Error("L'IA n'a pas renvoye de resultat exploitable pour ce document.");
    err.statusCode = 502;
    throw err;
  }
  return callPart.functionCall.args || {};
}

module.exports = { toGeminiSchema, buildFilePart, callGemini, callGeminiToolOnce, missingKeyError, DEFAULT_MODEL };
