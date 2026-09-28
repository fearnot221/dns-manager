-- Retain legacy hashes for history; no application endpoint accepts them.
ALTER TABLE "DnsUnit" ALTER COLUMN "passcodeHash" DROP NOT NULL;
CREATE TABLE "UnitAllowlist" (
  "unitId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "userId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitAllowlist_pkey" PRIMARY KEY ("unitId", "studentId"),
  CONSTRAINT "UnitAllowlist_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "DnsUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "UnitAllowlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "UnitAllowlist_studentId_idx" ON "UnitAllowlist"("studentId");
CREATE INDEX "UnitAllowlist_userId_idx" ON "UnitAllowlist"("userId");
-- Existing memberships and roles remain intact. Only unambiguous identities are backfilled.
INSERT INTO "UnitAllowlist" ("unitId", "studentId", "userId")
SELECT m."unitId", u."studentId", u."id"
FROM "UnitMember" m JOIN "User" u ON u."id" = m."userId"
WHERE u."studentId" IS NOT NULL AND length(trim(u."studentId")) > 0
AND u."removedAt" IS NULL
AND (SELECT count(*) FROM "User" x WHERE x."studentId" = u."studentId" AND x."removedAt" IS NULL) = 1;
