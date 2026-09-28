ALTER TABLE "InspectionTask" ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN "unitId" TEXT, ADD COLUMN "respondedBy" TEXT;
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_unitId_fkey"
FOREIGN KEY ("unitId") REFERENCES "DnsUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InspectionTask" ADD CONSTRAINT "InspectionTask_recipient_check"
CHECK (("userId" IS NOT NULL) <> ("unitId" IS NOT NULL));
CREATE INDEX "InspectionTask_unitId_status_idx" ON "InspectionTask"("unitId", "status");
CREATE UNIQUE INDEX "InspectionTask_pending_record_unit" ON "InspectionTask"("recordId", "unitId") WHERE "status" = 'PENDING';
