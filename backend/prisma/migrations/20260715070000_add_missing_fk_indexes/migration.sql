-- Indexation des colonnes de cle etrangere qui n'en avaient pas encore.
-- Prisma (comme Postgres) n'indexe PAS automatiquement les colonnes de relation scalaires :
-- seules les colonnes @id et @unique le sont. Or la quasi-totalite des routes de l'app filtrent
-- sur ces colonnes (ex: WHERE projectId = ..., WHERE lotId = ..., include project.organizationId),
-- notamment via les fonctions assertProjectAccess/loadWithAccess presentes dans (quasi) toutes les
-- routes. Sans index, ces requetes deviennent des scans complets de table a mesure que les projets
-- et les organisations se multiplient. IF NOT EXISTS rend la migration rejouable sans risque.

CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "ProjectMember_userId_idx" ON "ProjectMember"("userId");
CREATE INDEX IF NOT EXISTS "Project_organizationId_idx" ON "Project"("organizationId");

CREATE INDEX IF NOT EXISTS "Lot_projectId_idx" ON "Lot"("projectId");
CREATE INDEX IF NOT EXISTS "Lot_subcontractorId_idx" ON "Lot"("subcontractorId");

CREATE INDEX IF NOT EXISTS "UnitStepTemplate_lotId_idx" ON "UnitStepTemplate"("lotId");
CREATE INDEX IF NOT EXISTS "UnitStepTemplate_defaultSubcontractorId_idx" ON "UnitStepTemplate"("defaultSubcontractorId");

CREATE INDEX IF NOT EXISTS "Unit_lotId_idx" ON "Unit"("lotId");

CREATE INDEX IF NOT EXISTS "UnitStep_templateId_idx" ON "UnitStep"("templateId");
CREATE INDEX IF NOT EXISTS "UnitStep_subcontractorId_idx" ON "UnitStep"("subcontractorId");

CREATE INDEX IF NOT EXISTS "ProgressStatement_lotId_idx" ON "ProgressStatement"("lotId");
CREATE INDEX IF NOT EXISTS "ProgressStatement_subcontractorId_idx" ON "ProgressStatement"("subcontractorId");

CREATE INDEX IF NOT EXISTS "Subcontractor_organizationId_idx" ON "Subcontractor"("organizationId");

CREATE INDEX IF NOT EXISTS "Document_projectId_idx" ON "Document"("projectId");
CREATE INDEX IF NOT EXISTS "Document_lotId_idx" ON "Document"("lotId");
CREATE INDEX IF NOT EXISTS "Document_subcontractorId_idx" ON "Document"("subcontractorId");

CREATE INDEX IF NOT EXISTS "Equipment_projectId_idx" ON "Equipment"("projectId");
CREATE INDEX IF NOT EXISTS "Equipment_lotId_idx" ON "Equipment"("lotId");

CREATE INDEX IF NOT EXISTS "Column_projectId_idx" ON "Column"("projectId");

CREATE INDEX IF NOT EXISTS "Task_projectId_idx" ON "Task"("projectId");
CREATE INDEX IF NOT EXISTS "Task_lotId_idx" ON "Task"("lotId");
CREATE INDEX IF NOT EXISTS "Task_columnId_idx" ON "Task"("columnId");
CREATE INDEX IF NOT EXISTS "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX IF NOT EXISTS "Task_createdById_idx" ON "Task"("createdById");

CREATE INDEX IF NOT EXISTS "Milestone_projectId_idx" ON "Milestone"("projectId");

CREATE INDEX IF NOT EXISTS "BudgetItem_projectId_idx" ON "BudgetItem"("projectId");
CREATE INDEX IF NOT EXISTS "BudgetItem_lotId_idx" ON "BudgetItem"("lotId");
CREATE INDEX IF NOT EXISTS "BudgetItem_subcontractorId_idx" ON "BudgetItem"("subcontractorId");
CREATE INDEX IF NOT EXISTS "BudgetItem_relatedEntryId_idx" ON "BudgetItem"("relatedEntryId");

CREATE INDEX IF NOT EXISTS "SiteReport_projectId_idx" ON "SiteReport"("projectId");
CREATE INDEX IF NOT EXISTS "SiteReport_lotId_idx" ON "SiteReport"("lotId");
CREATE INDEX IF NOT EXISTS "SiteReport_authorId_idx" ON "SiteReport"("authorId");

CREATE INDEX IF NOT EXISTS "ReportPhoto_reportId_idx" ON "ReportPhoto"("reportId");

CREATE INDEX IF NOT EXISTS "Issue_projectId_idx" ON "Issue"("projectId");
CREATE INDEX IF NOT EXISTS "Issue_lotId_idx" ON "Issue"("lotId");

CREATE INDEX IF NOT EXISTS "MeetingMinutes_projectId_idx" ON "MeetingMinutes"("projectId");
CREATE INDEX IF NOT EXISTS "MeetingMinutes_lotId_idx" ON "MeetingMinutes"("lotId");

CREATE INDEX IF NOT EXISTS "Contract_projectId_idx" ON "Contract"("projectId");
CREATE INDEX IF NOT EXISTS "Contract_lotId_idx" ON "Contract"("lotId");
CREATE INDEX IF NOT EXISTS "Contract_subcontractorId_idx" ON "Contract"("subcontractorId");

CREATE INDEX IF NOT EXISTS "LotScopeItem_lotId_idx" ON "LotScopeItem"("lotId");

CREATE INDEX IF NOT EXISTS "QuoteComparison_projectId_idx" ON "QuoteComparison"("projectId");
CREATE INDEX IF NOT EXISTS "QuoteComparison_lotId_idx" ON "QuoteComparison"("lotId");

CREATE INDEX IF NOT EXISTS "Backup_organizationId_idx" ON "Backup"("organizationId");
CREATE INDEX IF NOT EXISTS "Backup_ownerId_idx" ON "Backup"("ownerId");
CREATE INDEX IF NOT EXISTS "Backup_delegateId_idx" ON "Backup"("delegateId");
