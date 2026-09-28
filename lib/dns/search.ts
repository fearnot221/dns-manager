/** Search authorized records; @ refers to the zone apex, not email addresses. */
export function matchesDnsRecord(query: string, name: string, zone: string, fields: string[]) {
  const needle = query.trim().toLowerCase();
  if (needle === "@") {
    const normalize = (value: string) => value.trim().toLowerCase().replace(/\.+$/, "");
    return normalize(name) === "@" || normalize(name) === normalize(zone);
  }
  return [name, ...fields].join(" ").toLowerCase().includes(needle);
}
