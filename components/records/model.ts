import type { RecordType, RRSet } from "@/lib/dns/types";

export type HashedRRSet = RRSet & { hash: string };
export type DialogState = { mode: "add" | "edit" | "delete"; rrset?: HashedRRSet };

export const creatableTypes: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "NS"];
export const protectedTypes = new Set<RecordType>(["SOA", "NS", "DS", "DNSKEY"]);
