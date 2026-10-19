import { zoneCategory } from "./zone-category";

const labelsOf = (name: string) => name.trim().toLowerCase().replace(/\.+$/, "").split(".").filter(Boolean);

/** What a reverse zone covers: the IP prefix it stands for and how many labels the record name must supply. */
export function reverseZoneInfo(zone: string) {
  const category = zoneCategory(zone);
  if (category === "forward") return null;
  const prefix = labelsOf(zone).slice(0, -2).reverse();
  const total = category === "ipv4" ? 4 : 32;
  return { family: category, prefix, remaining: Math.max(total - prefix.length, 0) };
}

/** The IP a reverse FQDN points at, or how many labels are still missing/extra. */
export function reverseNameIp(fqdn: string): { ip: string } | { missing: number } | null {
  const category = zoneCategory(fqdn);
  if (category === "forward") return null;
  const parts = labelsOf(fqdn).slice(0, -2).reverse();
  const total = category === "ipv4" ? 4 : 32;
  if (parts.length !== total) return { missing: total - parts.length };
  if (category === "ipv4") return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255) ? { ip: parts.map(Number).join(".") } : null;
  if (!parts.every((part) => /^[0-9a-f]$/.test(part))) return null;
  return { ip: compressIpv6(parts.join("").match(/.{4}/g)!.map((group) => group.replace(/^0+(?=.)/, ""))) };
}

/** Example IP inside the zone and the record name a user would type for it. */
export function reverseExample(zone: string) {
  const info = reverseZoneInfo(zone);
  if (!info?.remaining) return null;
  if (info.family === "ipv4") {
    const tail = ["192", "0", "2", "10"].slice(4 - info.remaining);
    return { ip: [...info.prefix, ...tail].join("."), name: [...tail].reverse().join(".") };
  }
  const tail = [...Array(info.remaining - 1).fill("0"), "1"];
  const nibbles = [...info.prefix, ...tail];
  return { ip: compressIpv6(nibbles.join("").match(/.{4}/g)!.map((group) => group.replace(/^0+(?=.)/, ""))), name: [...tail].reverse().join(".") };
}

function compressIpv6(groups: string[]) {
  // Collapse the longest run (2+) of zero groups into "::".
  let best = { start: -1, length: 0 };
  for (let i = 0; i < groups.length;) {
    if (groups[i] !== "0") { i++; continue; }
    let j = i; while (j < groups.length && groups[j] === "0") j++;
    if (j - i > best.length && j - i > 1) best = { start: i, length: j - i };
    i = j;
  }
  if (best.start < 0) return groups.join(":");
  return `${groups.slice(0, best.start).join(":")}::${groups.slice(best.start + best.length).join(":")}`;
}
