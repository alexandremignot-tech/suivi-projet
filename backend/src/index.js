require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");

const authRoutes = require("./routes/auth");
const organizationRoutes = require("./routes/organizations");
const projectRoutes = require("./routes/projects");
const columnRoutes = require("./routes/columns");
const taskRoutes = require("./routes/tasks");
const milestoneRoutes = require("./routes/milestones");
const budgetRoutes = require("./routes/budget");
const uploadRoutes = require("./routes/uploads");
const documentRoutes = require("./routes/documents");
const equipmentRoutes = require("./routes/equipments");
const subcontractorRoutes = require("./routes/subcontractors");
const siteReportRoutes = require("./routes/siteReports");
const googleIntegrationRoutes = require("./routes/integrations/google");
const odooIntegrationRoutes = require("./routes/integrations/odoo");
const lotRoutes = require("./routes/lots");
const progressStatementRoutes = require("./routes/progressStatements");
const dashboardRoutes = require("./routes/dashboard");
const unitRoutes = require("./routes/units");
const issueRoutes = require("./routes/issues");
const backupRoutes = require("./routes/backup");
const auditRoutes = require("./routes/audit");
const auditLogger = require("./utils/auditLogger");
const prisma = require("./db");

// Ajouts KARNO : PV de chantier, Contrats (vrai template), Couverture (vacances)
const meetingMinutesRoutes = require("./routes/meetingMinutes");
const contractRoutes = require("./routes/contracts");
const vacationBackupRoutes = require("./routes/backups");
const quoteComparisonRoutes = require("./routes/quoteComparisons");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Verifications de demarrage : mieux vaut echouer tout de suite avec un message clair dans les
// logs Render plutot que de decouvrir des heures plus tard que JWT_SECRET manquait (tous les
// logins auraient echoue avec une erreur 500 opaque) ou que DATABASE_URL manquait (Prisma aurait
// echoue au premier appel, pas au demarrage). GEMINI_API_KEY est juste signale (pas bloquant : les
// fonctionnalites IA sont degradees proprement sans elle, voir aiAssistant.js/contractExtraction.js).
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `Configuration manquante : ${missingEnv.join(", ")}. Verifie les variables d'environnement ` +
      `sur Render (backend > Environment) avant de redemarrer le service.`
  );
  process.exit(1);
}
if (!process.env.GEMINI_API_KEY) {
  console.warn(
    "GEMINI_API_KEY absente : les fonctionnalites IA (assistant projet, imports IA) repondront " +
      "un message explicite au lieu de fonctionner, mais le reste de l'application n'est pas affecte."
  );
}

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));
app.use(auditLogger); // journal des modifications (non bloquant)
app.get("/uploads/:name", async (req, res, next) => {
  try {
    const file = await prisma.storedFile.findUnique({ where: { name: req.params.name } });
    if (!file) return next();
    if (file.mime) res.setHeader("Content-Type", file.mime);
    res.setHeader("Content-Disposition", `inline; filename="${(file.originalName || file.name).replace(/"/g, "")}"`);
    res.send(Buffer.from(file.data));
  } catch (e) {
    next(e);
  }
});
app.use("/uploads", express.static(UPLOAD_DIR));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/auth", authRoutes);
app.use("/api/organizations", organizationRoutes);
app.use("/api/projects", projectRoutes);
app.use("/api/columns", columnRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/milestones", milestoneRoutes);
app.use("/api/budget-items", budgetRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/equipments", equipmentRoutes);
app.use("/api/subcontractors", subcontractorRoutes);
app.use("/api/site-reports", siteReportRoutes);
app.use("/api/integrations/google", googleIntegrationRoutes);
app.use("/api/integrations/odoo", odooIntegrationRoutes);
app.use("/api/lots", lotRoutes);
app.use("/api/progress-statements", progressStatementRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/backup", backupRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/meeting-minutes", meetingMinutesRoutes);
app.use("/api/contracts", contractRoutes);
app.use("/api/quote-comparisons", quoteComparisonRoutes);
// Couverture d'absence (vacances) : /api/backups (pluriel) ne collisionne pas avec /api/backup
// (singulier, export/restauration complete de la base, ci-dessus).
app.use("/api/backups", vacationBackupRoutes);
app.use("/api", unitRoutes);

// Gestion d'erreurs centralisee. Accepte err.statusCode (convention utilisee par la plupart des
// routes/utils recents : contracts.js, quoteExtraction.js, contractExtraction.js, geminiClient.js,
// lots.js) aussi bien que l'ancien err.status, pour ne jamais faire tomber une erreur 4xx precise
// (fichier trop gros, achat deja lie, IA non configuree...) sur un 500 generique par accident.
// Erreurs multer (fichier trop volumineux, champ de formulaire inattendu) traduites en JSON clair
// plutot que de laisser passer le message technique par defaut de la librairie.
app.use((err, req, res, next) => {
  console.error(err);
  if (err && err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Fichier trop volumineux pour cette upload."
        : "Erreur lors de l'envoi du fichier (" + err.message + ").";
    return res.status(400).json({ error: message });
  }
  res.status(err.statusCode || err.status || 500).json({ error: err.message || "Erreur serveur" });
});

// Filet de securite : logge clairement toute erreur qui echapperait aux handlers ci-dessus (bug
// dans du code hors requete HTTP, ex: un timer ou une Promise non attachee) au lieu de laisser
// Node crasher sans contexte exploitable dans les logs Render.
process.on("unhandledRejection", (reason) => {
  // Loggee mais non fatale : une promesse orpheline dans une fonctionnalite ne doit pas interrompre
  // le service pour tous les autres utilisateurs. A surveiller dans les logs Render si ca apparait.
  console.error("Promise rejetee non geree :", reason);
});
process.on("uncaughtException", (err) => {
  // Ici l'etat du process peut etre corrompu : on logge puis on s'arrete pour laisser Render
  // redemarrer un process propre, plutot que de continuer a servir des requetes dans un etat incertain.
  console.error("Exception non geree, arret du process pour redemarrage propre :", err);
  process.exit(1);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API suivi de projet demarree sur le port ${PORT}`);
});
