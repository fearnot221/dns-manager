CREATE TABLE "MailDelivery" (
  "id" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "recipient" TEXT NOT NULL,
  "fromEmail" TEXT NOT NULL,
  "fromName" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseUntil" TIMESTAMP(3),
  "leaseToken" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MailDelivery_status_check" CHECK ("status" IN ('PENDING', 'SENDING', 'SENT', 'FAILED'))
);
CREATE UNIQUE INDEX "MailDelivery_eventKey_recipient_key" ON "MailDelivery"("eventKey", "recipient");
CREATE INDEX "MailDelivery_status_availableAt_idx" ON "MailDelivery"("status", "availableAt");
