-- CreateEnum
CREATE TYPE "UnitStepStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');

-- CreateTable
CREATE TABLE "UnitStepTemplate" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "defaultSubcontractorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitStepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitStep" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" "UnitStepStatus" NOT NULL DEFAULT 'TODO',
    "subcontractorId" TEXT,
    "date" TIMESTAMP(3),
    "comment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnitStepTemplate_lotId_idx" ON "UnitStepTemplate"("lotId");

-- CreateIndex
CREATE INDEX "UnitStepTemplate_defaultSubcontractorId_idx" ON "UnitStepTemplate"("defaultSubcontractorId");

-- CreateIndex
CREATE INDEX "Unit_lotId_idx" ON "Unit"("lotId");

-- CreateIndex
CREATE INDEX "UnitStep_unitId_idx" ON "UnitStep"("unitId");

-- CreateIndex
CREATE INDEX "UnitStep_templateId_idx" ON "UnitStep"("templateId");

-- CreateIndex
CREATE INDEX "UnitStep_subcontractorId_idx" ON "UnitStep"("subcontractorId");

-- CreateIndex
CREATE UNIQUE INDEX "UnitStep_unitId_templateId_key" ON "UnitStep"("unitId", "templateId");

-- AddForeignKey
ALTER TABLE "UnitStepTemplate" ADD CONSTRAINT "UnitStepTemplate_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitStepTemplate" ADD CONSTRAINT "UnitStepTemplate_defaultSubcontractorId_fkey" FOREIGN KEY ("defaultSubcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Unit" ADD CONSTRAINT "Unit_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitStep" ADD CONSTRAINT "UnitStep_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitStep" ADD CONSTRAINT "UnitStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "UnitStepTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnitStep" ADD CONSTRAINT "UnitStep_subcontractorId_fkey" FOREIGN KEY ("subcontractorId") REFERENCES "Subcontractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
