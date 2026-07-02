// Genere un rapport de chantier mis en forme a partir des notes brutes.
// Si ANTHROPIC_API_KEY est configuree, utilise Claude pour produire un vrai resume structure.
// Sinon, applique une mise en forme simple (fallback sans IA) pour que la fonctionnalite reste utilisable.

async function generateSiteReportSummary({ title, date, notes, criticalPoints, photoCaptions }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return formatWithoutAI({ title, date, notes, criticalPoints, photoCaptions });
  }

  const prompt = `Tu rediges un rapport de suivi de chantier professionnel pour un projet de reseau de chaleur / geothermie / chaufferie industrielle.
Voici les elements bruts fournis par le chef de chantier :

Titre : ${title}
Date : ${date}
Notes (texte libre ou dictee vocale retranscrite) :
${notes || "(aucune note)"}

Points critiques signales :
${criticalPoints || "(aucun point critique signale)"}

Legendes des photos jointes :
${(photoCaptions || []).map((c, i) => `- Photo ${i + 1} : ${c || "(sans legende)"}`).join("\n") || "(aucune photo)"}

Redige un rapport structure en francais avec les sections suivantes : "Situation du chantier", "Avancement", "Points critiques et risques", "Actions a mener". Sois concis, factuel et actionnable. Ne pas inventer d'informations non fournies.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Anthropic:", response.status, errText);
      return formatWithoutAI({ title, date, notes, criticalPoints, photoCaptions });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    return text || formatWithoutAI({ title, date, notes, criticalPoints, photoCaptions });
  } catch (err) {
    console.error("Echec de generation IA du rapport:", err.message);
    return formatWithoutAI({ title, date, notes, criticalPoints, photoCaptions });
  }
}

function formatWithoutAI({ title, date, notes, criticalPoints, photoCaptions }) {
  const lines = [
    `Rapport de chantier - ${title}`,
    `Date : ${new Date(date).toLocaleDateString("fr-FR")}`,
    "",
    "Situation du chantier / notes :",
    notes || "(aucune note fournie)",
    "",
    "Points critiques et risques :",
    criticalPoints || "(aucun point critique signale)",
  ];

  if (photoCaptions && photoCaptions.length > 0) {
    lines.push("", "Photos jointes :");
    photoCaptions.forEach((c, i) => lines.push(`- Photo ${i + 1} : ${c || "(sans legende)"}`));
  }

  lines.push(
    "",
    "(Rapport genere automatiquement sans IA : configurez ANTHROPIC_API_KEY pour obtenir un resume structure et des recommandations d'actions.)"
  );

  return lines.join("\n");
}

module.exports = { generateSiteReportSummary };
