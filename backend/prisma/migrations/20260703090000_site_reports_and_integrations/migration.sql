-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('RESEAU_CHALEUR', 'GEOTHERMIE', 'CHAUFFERIE', 'SOUS_STATION', 'AUTRE');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "type" "ProjectType" NOT NULL DEFAULT 'AUTRE';
ALTER TABLE "Project" ADD COLUMN "odooProjectRef" TEXT;
ALTER TABLE "Project" ADD COLUMN "googleCalendarId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleRefreshToken" TEXT;
ALTER TABLE "User" ADD COLUMN "googleEmail" TEXT;

-- CreateTable
CREATE TABLE "SiteReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "notes" TEXT,
    "criticalPoints" TEXT,
    "aiSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportPhoto" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "caption" TEXT,

    CONSTRAINT "ReportPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteReport_projectId_idx" ON "SiteReport"("projectId");

-- CreateIndex
CREATE INDEX "ReportPhoto_reportId_idx" ON "ReportPhoto"("reportId");

-- AddForeignKey
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteReport" ADD CONSTRAINT "SiteReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportPhoto" ADD CONSTRAINT "ReportPhoto_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "SiteReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
