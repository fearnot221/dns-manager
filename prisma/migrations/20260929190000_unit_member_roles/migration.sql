BEGIN;
UPDATE "UnitMember" SET "role" = 'EDITOR' WHERE "role" = 'VIEWER';
ALTER TABLE "UnitMember" ALTER COLUMN "role" DROP DEFAULT;
ALTER TYPE "UnitRole" RENAME TO "UnitRole_old";
CREATE TYPE "UnitRole" AS ENUM ('EDITOR', 'ADMIN');
ALTER TABLE "UnitMember" ALTER COLUMN "role" TYPE "UnitRole" USING ("role"::text::"UnitRole");
ALTER TABLE "UnitMember" ALTER COLUMN "role" SET DEFAULT 'EDITOR';
DROP TYPE "UnitRole_old";
COMMIT;
