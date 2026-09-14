-- Populate only from a verified Logto UserInfo response on the next sign-in.
-- Do not infer authorization identity from historical display names/student IDs.
ALTER TABLE "User" ADD COLUMN "logtoName" TEXT;
