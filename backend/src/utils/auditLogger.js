// Middleware d'audit : journalise toutes les ecritures API (POST/PUT/PATCH/DELETE)
// avec l'utilisateur qui les a faites. Non bloquant : un echec de journalisation
// n'empeche jamais l'operation elle-meme.
const { randomUUID } = require("crypto");
const prisma = require("../db");

const ENTITY_FR = {
  tasks: "tache",
  columns: "colonne",
  milestones: "jalon",
  "budget-items": "ligne budgetaire",
  documents: "document",
  equipments: "equipement",
  subcontractors: "sous-traitant",
  lots: "lot",
  "progress-statements": "etat d'avancement",
  issues: "point ouvert",
  projects: "projet",
  uploads: "fichier",
  units: "unite",
  "unit-templates": "etape type",
  "unit-steps": "etape d'unite",
  "site-reports": "rapport de chantier",
  organizations: "organisation",
};

function summarize(body) {
  if (!body || typeof body !== "object") return null;
  try {
    const clean = { ...body };
    for (const k of ["data", "password", "passwordHash", "lines", "tables"]) delete clean[k];
    const s = JSON.stringify(clean);
    return s.length > 600 ? s.slice(0, 600) + "..." : s === "{}" ? null : s;
  } catch {
    return null;
  }
}

module.exports = function auditLogger(req, res, next) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();
  if (!req.path.startsWith("/api/") || req.path.startsWith("/api/auth") || req.path.startsWith("/api/backup")) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode >= 400 || !req.user) return;
    const segs = req.path.split("/").filter(Boolean); // ["api", "tasks", ":id", ...]
    const entityKey = segs[1];
    prisma.auditLog
      .create({
        data: {
          id: randomUUID(),
          organizationId: req.user.organizationId,
          userId: req.user.id || null,
          userName: req.user.name || req.user.email || "?",
          method: req.method,
          path: req.path,
          entity: ENTITY_FR[entityKey] || entityKey,
          entityId: segs[2] && segs[2].length > 10 ? segs[2] : null,
          projectId: (req.body && req.body.projectId) || null,
          summary: req.method === "DELETE" ? null : summarize(req.body),
        },
      })
      .catch(() => {});
  });
  next();
};
