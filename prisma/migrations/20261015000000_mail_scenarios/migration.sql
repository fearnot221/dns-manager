-- Notifications to applicants and unit administrators may omit the network team copy.
ALTER TABLE "MailDelivery" ADD COLUMN "ccTeam" BOOLEAN NOT NULL DEFAULT true;
