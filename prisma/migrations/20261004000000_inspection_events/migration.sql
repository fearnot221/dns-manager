CREATE TABLE "InspectionEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InspectionEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InspectionEvent_dates_check" CHECK ("startsOn" <= "endsOn")
);

CREATE INDEX "InspectionEvent_startsOn_endsOn_idx" ON "InspectionEvent"("startsOn", "endsOn");

ALTER TABLE "DnsInspection"
  ADD COLUMN "eventId" TEXT,
  ADD COLUMN "eventName" TEXT,
  ADD COLUMN "eventClassified" BOOLEAN NOT NULL DEFAULT false;
