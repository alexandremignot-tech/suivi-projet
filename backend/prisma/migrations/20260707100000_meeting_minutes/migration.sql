CREATE TABLE "MeetingMinutes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "lotId" TEXT,
    "numero" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "dateReunion" TIMESTAMP(3) NOT NULL,
    "datePublication" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "auteur" TEXT NOT NULL,
    "attendees" JSONB NOT NULL,
    "observations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingMinutes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingMinutes" ADD CONSTRAINT "MeetingMinutes_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
