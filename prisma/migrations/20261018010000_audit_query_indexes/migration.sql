CREATE INDEX "Session_expires_idx" ON "Session"("expires");
CREATE INDEX "AuditLog_zone_dnsScope_recordName_recordType_action_idx" ON "AuditLog"("zone", "dnsScope", "recordName", "recordType", "action");
