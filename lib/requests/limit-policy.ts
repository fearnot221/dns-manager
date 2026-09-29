function positive(name:string,fallback:number) {
  const value=process.env[name];
  if (!value) return fallback;
  const parsed=Number(value);
  if (!Number.isSafeInteger(parsed)||parsed<1||parsed>1_000_000_000) throw new Error(`Invalid ${name}`);
  return parsed;
}
export function applicationLimits() {
  return {batch:positive("DNS_APPLICATION_MAX_RECORDS",5000),pending:positive("DNS_UNIT_MAX_PENDING_RECORDS",50000),daily:positive("DNS_UNIT_MAX_DAILY_RECORDS",100000),pendingBytes:positive("DNS_UNIT_MAX_PENDING_BYTES",32*1024*1024),dailyBytes:positive("DNS_UNIT_MAX_DAILY_BYTES",64*1024*1024)};
}
