// Assistant IA du projet : repond en langage naturel a une question sur UN projet precis.
// Deux modes :
//  - Lecture seule (par defaut) : repond a partir du contexte du projet, n'ecrit jamais rien.
//  - Action proposee (perimetre restreint) : sur demande explicite de l'utilisateur, l'IA peut
//    appeler un outil parmi une liste blanche fermee (creer un point ouvert, ajouter une
//    observation a un PV existant, modifier certains champs d'un contrat existant). Dans tous les
//    cas l'IA ne fait qu'une PROPOSITION : aucune ecriture en base ne se produit ici. C'est
//    l'utilisateur qui confirme explicitement cote frontend, ce qui declenche l'appel a
//    executeAction() (route POST /projects/:id/actions/confirm), qui revalide tout avant d'ecrire.
//
// Reutilise le meme mecanisme que aiReport.js : appel direct a l'API Anthropic si
// ANTHROPIC_API_KEY est configuree, sinon message explicite (pas d'erreur, l'appli reste utilisable).

function fmtEUR(n) {
  return (n || 0).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " EUR";
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "-";
}

// Construit un resume textuel structure du projet (pas un dump JSON brut) pour servir de
// contexte au modele. Volontairement condense : totaux et listes courtes plutot que le detail
// exhaustif de chaque ligne, pour rester dans une taille de prompt raisonnable.
function buildProjectContext(project, issues, meetingMinutes, contracts) {
  const lines = [];
  lines.push(`Projet : ${project.name} (reference Odoo : ${project.odooProjectRef || "-"})`);
  lines.push(`Type : ${project.type} | Statut : ${project.status}`);
  if (project.description) lines.push(`Description : ${project.description}`);
  lines.push(`Budget total prevu : ${fmtEUR(project.budgetTotal)}`);

  const budgetItems = project.budgetItems || [];
  const sum = (arr) => arr.reduce((s, i) => s + i.amount, 0);
  const outEngaged = sum(budgetItems.filter((b) => b.type === "expense" && ["PURCHASE_ORDER", "AMENDMENT"].includes(b.entryType)));
  const outPaid = sum(budgetItems.filter((b) => b.type === "expense" && b.status === "PAID"));
  const inTotal = sum(budgetItems.filter((b) => b.type === "income" && b.entryType !== "RISK"));
  const risques = sum(budgetItems.filter((b) => b.entryType === "RISK"));
  lines.push(
    `Finances : IN = ${fmtEUR(inTotal)} | OUT engage (commandes+avenants) = ${fmtEUR(outEngaged)} | ` +
      `deja paye = ${fmtEUR(outPaid)} | risques cumules = ${fmtEUR(risques)} | ` +
      `marge brute = ${fmtEUR(inTotal - outEngaged)}`
  );

  lines.push("");
  lines.push("Lots (Building Blocks) :");
  for (const lot of project.lots || []) {
    const lotItems = budgetItems.filter((b) => b.lotId === lot.id);
    const lotOut = sum(lotItems.filter((b) => b.type === "expense" && ["PURCHASE_ORDER", "AMENDMENT"].includes(b.entryType)));
    const docsManquants = (lot.documents || []).filter((d) => d.status === "MISSING").length;
    lines.push(
      `- ${lot.code} "${lot.name}" | phase ${lot.phase} | sous-traitant ${lot.subcontractor?.name || "-"} | ` +
        `montant contrat ${fmtEUR(lot.contractAmount)} | depenses engagees ${fmtEUR(lotOut)} | ` +
        `${docsManquants} document(s) manquant(s) | ${(lot.units || []).length} unite(s) repetable(s)`
    );
  }

  const tasks = project.tasks || [];
  const doneColumn = (project.columns || [])[project.columns.length - 1];
  const now = new Date();
  const overdue = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.columnId !== doneColumn?.id);
  lines.push("");
  lines.push(
    `Taches : ${tasks.length} au total, ${tasks.filter((t) => t.columnId === doneColumn?.id).length} terminees, ${overdue.length} en retard.`
  );
  if (overdue.length > 0) {
    lines.push("Taches en retard : " + overdue.slice(0, 15).map((t) => `"${t.title}" (echeance ${fmtDate(t.dueDate)})`).join(", "));
  }

  const milestones = project.milestones || [];
  const overdueMil = milestones.filter((m) => !m.done && new Date(m.date) < now);
  const upcomingMil = milestones.filter((m) => !m.done && new Date(m.date) >= now);
  lines.push(
    `Jalons : ${overdueMil.length} depasse(s) non coche(s) (${overdueMil.map((m) => m.name).join(", ") || "aucun"}), ` +
      `${upcomingMil.length} a venir (${upcomingMil.map((m) => `${m.name} le ${fmtDate(m.date)}`).join(", ") || "aucun"}).`
  );

  const docs = project.documents || [];
  lines.push(`Documents transverses : ${docs.length} au total, ${docs.filter((d) => d.status === "MISSING").length} manquant(s).`);

  if (issues && issues.length > 0) {
    const open = issues.filter((i) => i.status !== "CLOSED");
    lines.push("");
    lines.push(`Points ouverts (Comment tracker) : ${open.length} ouvert(s) sur ${issues.length} au total.`);
    if (open.length > 0) {
      lines.push(
        "Details points ouverts : " +
          open.slice(0, 20).map((i) => `#${i.number} "${i.title}" (${i.topic || "-"}, assigne : ${i.assignee || "-"})`).join(" | ")
      );
    }
  }

  if (meetingMinutes && meetingMinutes.length > 0) {
    lines.push("");
    lines.push(
      `PV de chantier : ${meetingMinutes.length} au total, dernier le ${fmtDate(meetingMinutes[0]?.dateReunion)} (${meetingMinutes[0]?.reference || ""}).`
    );
    lines.push(
      "Numeros de PV disponibles : " + meetingMinutes.map((m) => `n°${m.numero}`).join(", ")
    );
  }

  if (contracts && contracts.length > 0) {
    lines.push(`Contrats generes : ${contracts.length} (${contracts.map((c) => c.title).slice(0, 10).join(", ")}).`);
  }

  return lines.join("\n");
}

// Champs de contrat modifiables par l'IA (perimetre volontairement restreint : identique a une
// partie de FIELD_KEYS dans routes/contracts.js, a l'exclusion du titre/du lot/du sous-traitant
// lies et de tout champ structurel). A garder synchronise si FIELD_KEYS evolue.
const EDITABLE_CONTRACT_FIELDS = [
  "CONTACT_NOM",
  "CONTACT_FONCTION",
  "CONTACT_EMAIL",
  "CONTACT_TEL",
  "ST_NOM",
  "ST_ADRESSE",
  "ST_BCE",
  "ST_SPECIALITE",
  "ST_CEO_NOM",
  "ST_CONTACT1_NOM",
  "ST_CONTACT1_EMAIL",
  "ST_CONTACT1_TEL",
  "ST_CONTACT2_NOM",
  "ST_CONTACT2_FONCTION",
  "ST_CONTACT2_EMAIL",
  "ST_CONTACT2_TEL",
  "ADRESSE_CHANTIER",
  "CHECKINWORK",
  "DATE_DEBUT",
  "DATE_FIN",
  "MONTANT_FORFAIT",
  "MONTANT_GARANTIE",
  "SEUIL_EQUIPEMENT",
  "DATE_SIGNATURE",
];

// Outils (function calling) que le modele peut appeler. Chacun correspond a UNE PROPOSITION,
// jamais a une ecriture directe : voir buildProposedAction() et executeAction() ci-dessous.
const TOOLS = [
  {
    name: "create_issue",
    description:
      "Propose la creation d'un nouveau point ouvert (Comment tracker) sur ce projet. N'ecrit rien " +
      "directement : la proposition est presentee a l'utilisateur, qui doit explicitement confirmer " +
      "avant toute creation reelle. N'utilise cet outil que si l'utilisateur demande clairement de " +
      "creer/ajouter un point ouvert.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre court et clair du point ouvert" },
        description: { type: "string", description: "Description detaillee (optionnel)" },
        topic: { type: "string", description: "Categorie libre, ex: Build, Commissioning, Design (optionnel)" },
        action: { type: "string", description: "Action attendue / prochaine etape (optionnel)" },
        assignee: { type: "string", description: "Personne ou entite assignee (optionnel)" },
        lotCode: { type: "string", description: "Code du lot concerne si mentionne, ex: BB2 (optionnel)" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_meeting_minutes_observation",
    description:
      "Propose d'ajouter une observation a un PV de chantier EXISTANT de ce projet (n'en cree pas un " +
      "nouveau). N'ecrit rien directement, confirmation utilisateur requise. N'utilise cet outil que " +
      "si l'utilisateur demande clairement d'ajouter une observation/remarque a un PV.",
    input_schema: {
      type: "object",
      properties: {
        meetingMinutesNumero: {
          type: "integer",
          description: "Numero du PV cible (ex: 3 pour 'PV n°3'). Si non precise, le PV le plus recent est utilise.",
        },
        title: { type: "string", description: "Titre court de l'observation" },
        body: { type: "string", description: "Contenu de l'observation" },
        resp: { type: "string", description: "Responsable de l'action (optionnel)" },
        pourLe: { type: "string", description: "Echeance 'pour le', texte libre (optionnel)" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "update_contract_field",
    description:
      "Propose de modifier un ou plusieurs champs d'un contrat de sous-traitance EXISTANT (montant, " +
      "dates, contacts...). N'ecrit rien directement, confirmation utilisateur requise. Champs " +
      `autorises uniquement : ${EDITABLE_CONTRACT_FIELDS.join(", ")}. N'utilise jamais une cle hors de cette liste.`,
    input_schema: {
      type: "object",
      properties: {
        contractTitle: { type: "string", description: "Titre (ou debut du titre) du contrat a modifier" },
        fields: {
          type: "object",
          description: "Paires cle/valeur, cles parmi la liste des champs autorises uniquement",
        },
      },
      required: ["contractTitle", "fields"],
    },
  },
];

function resolveLot(lots, lotCode) {
  if (!lotCode) return null;
  const needle = String(lotCode).trim().toLowerCase();
  return (lots || []).find((l) => l.code && l.code.toLowerCase() === needle) || null;
}

// meetingMinutes est trie numero desc (voir requete dans routes/projects.js) : [0] = le plus recent
function resolveMeetingMinutes(meetingMinutes, numero) {
  const list = meetingMinutes || [];
  if (numero) {
    const found = list.find((m) => m.numero === Number(numero));
    if (found) return found;
  }
  return list[0] || null;
}

function resolveContract(contracts, title) {
  if (!title) return null;
  const needle = String(title).trim().toLowerCase();
  const list = contracts || [];
  return (
    list.find((c) => c.title && c.title.toLowerCase() === needle) ||
    list.find((c) => c.title && c.title.toLowerCase().includes(needle)) ||
    null
  );
}

// Transforme un appel d'outil du modele en une "action proposee" prete a etre affichee et
// confirmee cote frontend. Ne touche JAMAIS la base de donnees : seul executeAction() ecrit.
function buildProposedAction(toolUse, { lots, meetingMinutes, contracts }) {
  const { name, input } = toolUse;

  if (name === "create_issue") {
    const lot = resolveLot(lots, input.lotCode);
    return {
      type: "create_issue",
      summary: `Creer le point ouvert "${input.title}"${lot ? ` (lot ${lot.code})` : ""}`,
      preview: {
        Titre: input.title,
        Lot: lot ? `${lot.code} - ${lot.name}` : "-",
        Categorie: input.topic || "-",
        Assigne: input.assignee || "-",
        Description: input.description || "-",
      },
      payload: {
        title: input.title,
        description: input.description || null,
        topic: input.topic || null,
        action: input.action || null,
        assignee: input.assignee || null,
        lotId: lot ? lot.id : null,
      },
    };
  }

  if (name === "add_meeting_minutes_observation") {
    const mm = resolveMeetingMinutes(meetingMinutes, input.meetingMinutesNumero);
    if (!mm) {
      return { type: "error", summary: "Aucun PV de chantier trouve sur ce projet pour y ajouter une observation." };
    }
    return {
      type: "add_meeting_minutes_observation",
      summary: `Ajouter une observation au PV n°${mm.numero} (${mm.reference})`,
      preview: {
        PV: `n°${mm.numero} - ${mm.reference}`,
        Titre: input.title,
        Contenu: input.body,
        Responsable: input.resp || "-",
        "Pour le": input.pourLe || "-",
      },
      payload: {
        meetingMinutesId: mm.id,
        observation: {
          ref: `${mm.numero}.${(Array.isArray(mm.observations) ? mm.observations.length : 0) + 1}`,
          title: input.title,
          body: input.body,
          resp: input.resp || "",
          pourLe: input.pourLe || "",
        },
      },
    };
  }

  if (name === "update_contract_field") {
    const contract = resolveContract(contracts, input.contractTitle);
    if (!contract) {
      return { type: "error", summary: `Aucun contrat trouve correspondant a "${input.contractTitle}".` };
    }
    const fields = {};
    const rejected = [];
    for (const [key, value] of Object.entries(input.fields || {})) {
      if (EDITABLE_CONTRACT_FIELDS.includes(key)) fields[key] = value;
      else rejected.push(key);
    }
    if (Object.keys(fields).length === 0) {
      return { type: "error", summary: "Aucun champ modifiable reconnu dans la demande." };
    }
    return {
      type: "update_contract_field",
      summary: `Modifier le contrat "${contract.title}" (${Object.keys(fields).length} champ(s))`,
      preview: { Contrat: contract.title, ...fields },
      rejectedFields: rejected.length ? rejected : undefined,
      payload: { contractId: contract.id, fields },
    };
  }

  return null;
}

async function generateProjectAnswer({ project, issues, meetingMinutes, contracts, question, history }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const context = buildProjectContext(project, issues, meetingMinutes, contracts);

  if (!apiKey) {
    return {
      answer:
        "L'assistant IA n'est pas configure sur ce serveur (variable ANTHROPIC_API_KEY manquante). " +
        "Demande a un administrateur de la renseigner dans les parametres Render du backend.",
      configured: false,
    };
  }

  const system = `Tu es l'assistant du chef de projet pour le suivi d'un chantier d'installation energetique (reseau de chaleur, geothermie, chaufferie, sous-stations). Tu reponds UNIQUEMENT a partir des donnees du projet fournies ci-dessous. Si une information n'est pas presente dans ces donnees, dis-le clairement plutot que d'inventer. Reponds en francais, de maniere concise et directe (pas de formules de politesse superflues).

Tu peux aussi PROPOSER une action parmi trois outils : creer un point ouvert, ajouter une observation a un PV de chantier existant, ou modifier certains champs d'un contrat existant. Ce sont les SEULES actions que tu peux proposer ; tu ne peux rien modifier d'autre (pas de budget, pas de suppression, pas de creation de PV ou de contrat, pas de taches). N'appelle un outil que si l'utilisateur le demande explicitement (verbes comme "cree", "ajoute", "modifie"). Que tu appelles un outil ou non, tu n'ecris JAMAIS reellement en base depuis cette conversation : l'action est seulement proposee a l'utilisateur, qui doit la confirmer explicitement dans l'interface. Ne dis donc jamais que l'action a ete faite ; dis que tu la proposes / que tu prepares la demande.

Donnees du projet :
${context}`;

  const messages = [...(Array.isArray(history) ? history : []), { role: "user", content: question }];

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
        system,
        messages,
        tools: TOOLS,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Anthropic (assistant):", response.status, errText);
      return { answer: "Erreur lors de l'appel a l'IA. Reessaie dans un instant.", configured: true, error: true };
    }

    const data = await response.json();
    const content = Array.isArray(data.content) ? data.content : [];
    const answer = content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    const toolUse = content.find((b) => b.type === "tool_use");

    if (toolUse) {
      const proposedAction = buildProposedAction(toolUse, { lots: project.lots, meetingMinutes, contracts });
      if (proposedAction && proposedAction.type === "error") {
        return { answer: answer || proposedAction.summary, configured: true };
      }
      if (proposedAction) {
        return { answer: answer || "Voici ce que je te propose :", configured: true, proposedAction };
      }
    }

    return { answer: answer || "Reponse vide de l'IA.", configured: true };
  } catch (err) {
    console.error("Echec appel assistant IA:", err.message);
    return { answer: "Erreur reseau lors de l'appel a l'IA. Reessaie dans un instant.", configured: true, error: true };
  }
}

// Execute reellement une action confirmee par l'utilisateur. Revalide tout (types, listes
// blanches) independamment de ce que le modele/le frontend ont pu envoyer : c'est le seul point
// d'ecriture de tout le mecanisme d'assistant IA. projectId vient de l'URL (deja verifie
// appartenir a l'organisation de l'utilisateur par l'appelant), jamais du payload.
async function executeAction(prisma, projectId, type, payload) {
  if (type === "create_issue") {
    if (!payload || !payload.title) throw new Error("Titre du point ouvert manquant");
    let lotId = null;
    if (payload.lotId) {
      const lot = await prisma.lot.findFirst({ where: { id: payload.lotId, projectId } });
      lotId = lot ? lot.id : null;
    }
    const max = await prisma.issue.aggregate({ where: { projectId }, _max: { number: true } });
    const issue = await prisma.issue.create({
      data: {
        projectId,
        lotId,
        number: (max._max.number || 0) + 1,
        status: "OPEN",
        topic: payload.topic || null,
        title: payload.title,
        description: payload.description || null,
        action: payload.action || null,
        assignee: payload.assignee || null,
      },
    });
    return { message: `Point ouvert #${issue.number} cree.`, record: issue };
  }

  if (type === "add_meeting_minutes_observation") {
    if (!payload || !payload.meetingMinutesId || !payload.observation) throw new Error("Donnees d'observation manquantes");
    const mm = await prisma.meetingMinutes.findFirst({ where: { id: payload.meetingMinutesId, projectId } });
    if (!mm) throw new Error("PV de chantier introuvable sur ce projet");
    const existing = Array.isArray(mm.observations) ? mm.observations : [];
    const observations = [...existing, payload.observation];
    const updated = await prisma.meetingMinutes.update({ where: { id: mm.id }, data: { observations } });
    return { message: `Observation ajoutee au PV n°${mm.numero}.`, record: updated };
  }

  if (type === "update_contract_field") {
    if (!payload || !payload.contractId || !payload.fields) throw new Error("Donnees de contrat manquantes");
    const contract = await prisma.contract.findFirst({ where: { id: payload.contractId, projectId } });
    if (!contract) throw new Error("Contrat introuvable sur ce projet");
    const fields = {};
    for (const [key, value] of Object.entries(payload.fields)) {
      if (EDITABLE_CONTRACT_FIELDS.includes(key)) fields[key] = value; // revalidation defensive
    }
    if (Object.keys(fields).length === 0) throw new Error("Aucun champ modifiable dans la demande");
    const currentData = contract.data && typeof contract.data === "object" ? contract.data : {};
    const updated = await prisma.contract.update({
      where: { id: contract.id },
      data: { data: { ...currentData, ...fields } },
    });
    return { message: `Contrat "${contract.title}" mis a jour.`, record: updated };
  }

  throw new Error("Type d'action inconnu");
}

module.exports = { generateProjectAnswer, buildProjectContext, executeAction, EDITABLE_CONTRACT_FIELDS };
