export const zoneCategories = [
  { id: "forward", label: "一般網域", suffix: "Zones", description: "正向解析網域" },
  { id: "ipv4", label: "IPv4 反解", suffix: "in-addr.arpa", description: "IPv4 反向解析網域" },
  { id: "ipv6", label: "IPv6 反解", suffix: "ip6.arpa", description: "IPv6 反向解析網域" },
] as const;
export type ZoneCategory = typeof zoneCategories[number]["id"];

export function zoneCategory(name: string): ZoneCategory {
  const normalized = name.trim().toLowerCase().replace(/\.$/, "");
  if (normalized === "in-addr.arpa" || normalized.endsWith(".in-addr.arpa")) return "ipv4";
  if (normalized === "ip6.arpa" || normalized.endsWith(".ip6.arpa")) return "ipv6";
  return "forward";
}

export function filterZones<T extends { name: string }>(zones: T[], category: ZoneCategory, query: string) {
  const search = query.trim().toLowerCase();
  return zones.filter((zone) => zoneCategory(zone.name) === category && zone.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
