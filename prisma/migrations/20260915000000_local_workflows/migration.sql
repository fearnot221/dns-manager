ALTER TABLE "User" ADD COLUMN "removedAt" TIMESTAMP(3);
CREATE TABLE "ContactMessage" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL, "body" TEXT NOT NULL,
  "reply" TEXT, "repliedBy" TEXT, "repliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ContactMessage_userId_createdAt_idx" ON "ContactMessage"("userId", "createdAt");
CREATE TABLE "InspectionTask" (
  "id" TEXT PRIMARY KEY, "recordId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "snapshot" JSONB NOT NULL,
  "response" TEXT, "respondedAt" TIMESTAMP(3),
  CONSTRAINT "InspectionTask_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InspectionTask_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DnsRecordMetadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "InspectionTask_userId_status_idx" ON "InspectionTask"("userId", "status");
CREATE INDEX "InspectionTask_recordId_createdAt_idx" ON "InspectionTask"("recordId", "createdAt");
CREATE UNIQUE INDEX "InspectionTask_pending_record_user" ON "InspectionTask"("recordId", "userId") WHERE "status" = 'PENDING';
