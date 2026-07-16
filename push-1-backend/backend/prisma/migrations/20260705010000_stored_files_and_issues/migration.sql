-- 1) Fichiers stockes en base de donnees (survivent aux redeploiements Render,
--    contrairement au disque ephemere du plan gratuit)
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT,
    "mime" TEXT,
    "size" INTEGER,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoredFile_name_key" ON "StoredFile"("name");

-- 2) Points ouverts (Comment tracker) : remarques Open / In progress / Closed
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'CLOSED');

CREATE TABLE "Issue" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lotId" TEXT,
    "number" INTEGER NOT NULL,
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "topic" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "action" TEXT,
    "assignee" TEXT,
    "author" TEXT,
    "response" TEXT,
    "dueDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Issue_projectId_idx" ON "Issue"("projectId");

ALTER TABLE "Issue" ADD CONSTRAINT "Issue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
