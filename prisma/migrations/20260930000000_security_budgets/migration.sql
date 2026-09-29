CREATE TABLE "SecurityRateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "SecurityRateLimit_expiresAt_idx" ON "SecurityRateLimit"("expiresAt");
CREATE INDEX "DnsRecordRequest_unitId_createdAt_idx" ON "DnsRecordRequest"("unitId", "createdAt");
