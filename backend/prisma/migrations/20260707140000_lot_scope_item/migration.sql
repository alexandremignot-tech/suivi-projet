CREATE TABLE "LotScopeItem" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "commentaire" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotScopeItem_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LotScopeItem" ADD CONSTRAINT "LotScopeItem_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
