import type { RecordType, RRSet } from "@/lib/dns/types";

export type HashedRRSet = RRSet & { hash: string };
export type ViewMode = "table" | "list" | "grid" | "type" | "name" | "content";
export type DialogState = { mode: "add" | "edit" | "delete"; rrset?: HashedRRSet };

export const creatableTypes: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"];
export const protectedTypes = new Set<RecordType>(["SOA", "NS", "DS", "DNSKEY"]);
export type RecordViewProps = {
  rrsets: HashedRRSet[];
  zone: string;
  canMutate: (rrset: HashedRRSet) => boolean;
  copy: (value: string) => void;
  openOwnership: (record: import("@/lib/inventory/types").InventoryRecord) => void;
  open: (dialog: { mode: "edit" | "delete"; rrset: HashedRRSet }) => void;
};

export const boardColumns = [
  ...Array.from({ length: 26 }, (_, index) => {
    const min = index === 0 ? 0 : index * 10 + 1;
    const max = Math.min((index + 1) * 10, 255);
    return { key: `${min}-${max}`, label: `.${min}–.${max}`, min, max };
  }),
  { key: "other", label: "其他", min: -1, max: -1 },
];

export function ipSuffix(type: RecordType, content: string) {
  if (type === "A") {
    const parts = content.trim().split(".").map(Number);
    return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts[3] : null;
  }
  if (type === "AAAA") {
    const address = content.trim().split("%")[0];
    if (!address.includes(":")) return null;
    if (address.endsWith("::")) return 0;
    const lastPart = address.split(":").at(-1) ?? "";
    if (lastPart.includes(".")) {
      const lastOctet = Number(lastPart.split(".").at(-1));
      return Number.isInteger(lastOctet) && lastOctet >= 0 && lastOctet <= 255 ? lastOctet : null;
    }
    const lastHextet = Number.parseInt(lastPart, 16);
    return Number.isFinite(lastHextet) && lastHextet >= 0 && lastHextet <= 0xffff ? lastHextet & 0xff : null;
  }
  return null;
}

export function displayName(name: string, zone: string) {
  const clean = name.replace(/\.$/, "");
  const base = zone.replace(/\.$/, "");
  return clean === base ? "@" : clean.endsWith(`.${base}`) ? clean.slice(0, -base.length - 1) : clean;
}
