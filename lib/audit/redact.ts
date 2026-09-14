const sensitive = /password|passwd|passcode|secret|token|authorization|cookie|api.?key|encrypted.?key|database.?url/i;
export function redactAudit(value: unknown): unknown {
  if (value === undefined || value === null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(redactAudit);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive.test(key) ? "[REDACTED]" : redactAudit(item)]));
  if (typeof value === "string") {
    let result = value.replace(/(bearer\s+)\S+/gi, "$1[REDACTED]").replace(/((?:password|api[-_ ]?key|secret|token)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]");
    for (const [key, secret] of Object.entries(process.env)) if (sensitive.test(key) && secret && secret.length >= 8) result = result.split(secret).join("[REDACTED]");
    return result;
  }
  return value;
}
