ALTER TABLE "DnsRecordMetadata" ADD COLUMN "recordStatus" TEXT
  CHECK ("recordStatus" IN ('IN_USE', 'DEPRECATED', 'RESERVED', 'DISABLED'));
ALTER TABLE "DnsInspection" ADD COLUMN "recordStatus" TEXT
  CHECK ("recordStatus" IN ('IN_USE', 'DEPRECATED', 'RESERVED', 'DISABLED'));
