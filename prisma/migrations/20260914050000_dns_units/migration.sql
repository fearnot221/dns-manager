CREATE TYPE "UnitRole" AS ENUM ('VIEWER', 'EDITOR', 'ADMIN');
CREATE TABLE "DnsUnit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "passcodeHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "DnsUnit_name_key" ON "DnsUnit"("name");
CREATE UNIQUE INDEX "DnsUnit_passcodeHash_key" ON "DnsUnit"("passcodeHash");
CREATE TABLE "UnitMember" (
  "unitId" TEXT NOT NULL REFERENCES "DnsUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" "UnitRole" NOT NULL DEFAULT 'VIEWER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("unitId", "userId")
);
CREATE INDEX "UnitMember_userId_idx" ON "UnitMember"("userId");
ALTER TABLE "DnsRecordRequest" ADD COLUMN "unitId" TEXT REFERENCES "DnsUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN "sourceRecordId" TEXT,
  ADD COLUMN "originalContent" TEXT,
  ADD COLUMN "expectedRRSet" JSONB,
  ADD COLUMN "connectionScope" TEXT;
ALTER TABLE "DnsRecordMetadata" ADD COLUMN "unitId" TEXT REFERENCES "DnsUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "DnsRecordRequest_unitId_status_idx" ON "DnsRecordRequest"("unitId", "status");
CREATE INDEX "DnsRecordMetadata_unitId_idx" ON "DnsRecordMetadata"("unitId");
