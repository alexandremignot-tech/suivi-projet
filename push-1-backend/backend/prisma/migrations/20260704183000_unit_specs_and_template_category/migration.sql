-- AlterTable
ALTER TABLE "UnitStepTemplate" ADD COLUMN "category" TEXT;

-- AlterTable
ALTER TABLE "Unit" ADD COLUMN "specs" JSONB;
