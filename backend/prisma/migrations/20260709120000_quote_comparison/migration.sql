CREATE TABLE "QuoteComparison" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lotId" TEXT,
    "title" TEXT NOT NULL,
    "criteria" JSONB NOT NULL DEFAULT '[]',
    "offers" JSONB NOT NULL DEFAULT '[]',
    "lineItems" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuoteComparison_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "QuoteComparison" ADD CONSTRAINT "QuoteComparison_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteComparison" ADD CONSTRAINT "QuoteComparison_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
