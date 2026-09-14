-- Display/contact data only. Preserve the existing email used by Auth.js account binding.
ALTER TABLE "User" ADD COLUMN "portalEmail" TEXT;
