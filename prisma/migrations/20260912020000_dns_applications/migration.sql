-- Nullable fields preserve existing requests; new applications require contact details.
ALTER TABLE "DnsRecordRequest"
ADD COLUMN "applicationId" TEXT,
ADD COLUMN "applicantName" TEXT,
ADD COLUMN "applicantUnit" TEXT,
ADD COLUMN "applicantExtension" TEXT;

CREATE INDEX "DnsRecordRequest_applicationId_idx" ON "DnsRecordRequest"("applicationId");
