export const RECORD_TYPES = ["A","AAAA","CNAME","MX","TXT","NS","SRV","CAA","PTR","NAPTR","TLSA","SSHFP","DS","DNSKEY","SOA"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface PdnsRecord { content: string; disabled: boolean; ownership?: import("@/lib/inventory/types").Ownership }
export interface RRSet { name: string; type: RecordType; ttl: number; records: PdnsRecord[]; comments?: Array<{ content:string; account?:string; modified_at?:number }> }
export interface Zone { id:string; name:string; kind:"Native"|"Master"|"Slave"|"Producer"|"Consumer"; serial:number; dnssec:boolean; rrsets:RRSet[]; edited_serial?:number; notified_serial?:number; last_check?:number; }
export type ZoneRole = "VIEWER" | "EDITOR" | "ADMIN";
export type GlobalRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export interface Actor { id:string; email:string; name?:string|null; globalRole:GlobalRole; zoneRoles:Record<string,ZoneRole>; }

export interface AuditEvent {
  id:string; createdAt:string; userEmail:string; zone:string; recordName?:string; recordType?:string;
  action:string; before?:unknown; after?:unknown; success:boolean; errorMessage?:string;
}
