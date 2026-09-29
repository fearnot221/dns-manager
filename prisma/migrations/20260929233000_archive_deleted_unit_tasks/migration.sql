-- Preserve the historical recipient without keeping a foreign key to a deleted unit.
ALTER TABLE "InspectionTask"
  ADD COLUMN "archivedUnitId" TEXT,
  ADD COLUMN "archivedUnitName" TEXT;

ALTER TABLE "InspectionTask" DROP CONSTRAINT "InspectionTask_recipient_check";
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_recipient_check"
  CHECK (num_nonnulls("userId", "unitId", "archivedUnitId") = 1);
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_archived_unit_check"
  CHECK (("archivedUnitId" IS NULL) = ("archivedUnitName" IS NULL));
