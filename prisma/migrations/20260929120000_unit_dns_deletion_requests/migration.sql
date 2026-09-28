CREATE TYPE "DnsRequestOperation" AS ENUM ('CREATE', 'UPDATE', 'DELETE');
ALTER TABLE "DnsRecordRequest" ADD COLUMN "operation" "DnsRequestOperation" NOT NULL DEFAULT 'CREATE';
UPDATE "DnsRecordRequest" SET "operation" = 'UPDATE' WHERE "sourceRecordId" IS NOT NULL;
