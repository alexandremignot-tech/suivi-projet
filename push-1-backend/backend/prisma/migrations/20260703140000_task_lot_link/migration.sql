-- AlterTable
ALTER TABLE "Task" ADD COLUMN "lotId" TEXT;

-- CreateIndex
CREATE INDEX "Task_lotId_idx" ON "Task"("lotId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
