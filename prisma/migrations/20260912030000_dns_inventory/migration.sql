ALTER TYPE "GlobalRole" ADD VALUE 'ADMIN';
ALTER TABLE "User" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "DnsRecordMetadata" (
  "id" TEXT PRIMARY KEY,
  "zoneName" TEXT NOT NULL,
  "recordName" TEXT NOT NULL,
  "recordType" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "applicantName" TEXT NOT NULL DEFAULT '',
  "applicantEmail" TEXT NOT NULL DEFAULT '',
  "applicantUnit" TEXT NOT NULL DEFAULT '',
  "applicantExtension" TEXT NOT NULL DEFAULT '',
  "purpose" TEXT NOT NULL DEFAULT '',
  "updatedBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "DnsRecordMetadata_zoneName_idx" ON "DnsRecordMetadata"("zoneName");
CREATE TABLE "DnsInspection" (
  "id" TEXT PRIMARY KEY,
  "recordId" TEXT NOT NULL REFERENCES "DnsRecordMetadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "inspectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "inspectorId" TEXT NOT NULL,
  "inspectorEmail" TEXT NOT NULL,
  "inspectorName" TEXT NOT NULL,
  "note" TEXT NOT NULL
);
CREATE INDEX "DnsInspection_recordId_inspectedAt_idx" ON "DnsInspection"("recordId", "inspectedAt");
