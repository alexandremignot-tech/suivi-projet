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
const offerRoutes = require("./routes/offers");
const auditRoutes = require("./routes/audit");
const auditLogger = require("./utils/auditLogger");
const prisma = require("./db");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());
app.use(morgan("dev"));
app.use(auditLogger); // journal des modifications (non bloquant)
// Fichiers : d'abord la base de donnees (persistante), puis le disque en secours
// (anciens fichiers uploades avant la migration vers StoredFile).
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
app.use("/api/offers", offerRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api", unitRoutes);

// Gestion d'erreurs centralisee
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API suivi de projet demarree sur le port ${PORT}`);
});
