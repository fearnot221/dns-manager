CREATE TABLE "DnsRequestPublication" (
    "requestId" TEXT NOT NULL,
    "connectionScope" TEXT NOT NULL,
    "beforeRRSet" JSONB,
    "afterRRSet" JSONB,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DnsRequestPublication_pkey" PRIMARY KEY ("requestId")
);
CREATE INDEX "DnsRequestPublication_completedAt_idx" ON "DnsRequestPublication"("completedAt");
