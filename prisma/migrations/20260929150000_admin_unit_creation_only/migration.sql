ALTER TABLE "DnsUnit" ALTER COLUMN "status" SET DEFAULT 'APPROVED';
-- Existing inactive units and historical review fields are preserved; no access is granted retroactively.
