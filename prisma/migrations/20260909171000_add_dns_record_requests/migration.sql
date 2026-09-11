CREATE TYPE "DnsRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "DnsRecordRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "recordName" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ttl" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" "DnsRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DnsRecordRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DnsRecordRequest_userId_createdAt_idx" ON "DnsRecordRequest"("userId", "createdAt");
CREATE INDEX "DnsRecordRequest_zoneName_status_createdAt_idx" ON "DnsRecordRequest"("zoneName", "status", "createdAt");
CREATE INDEX "DnsRecordRequest_status_createdAt_idx" ON "DnsRecordRequest"("status", "createdAt");

ALTER TABLE "DnsRecordRequest" ADD CONSTRAINT "DnsRecordRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DnsRecordRequest" ADD CONSTRAINT "DnsRecordRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
