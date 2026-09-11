import { isIP } from "node:net";
import type { RecordType } from "./types";

const MAX_TTL = 2_147_483_647;

export function normalizeZoneName(input:string):string {
  const value = input.trim().toLowerCase().replace(/\.+$/, "");
  if (!value || value.length > 253 || value.split(".").some((label)=>!isLabel(label))) throw new Error("Invalid DNS zone name");
  return `${value}.`;
}

export function normalizeDnsName(input:string, zone:string):string {
  const canonicalZone = normalizeZoneName(zone);
  const value = input.trim().toLowerCase();
  if (value === "@" || value === canonicalZone || value === canonicalZone.slice(0,-1)) return canonicalZone;
  const raw = value.replace(/\.+$/, "");
  const fqdn = raw.endsWith(canonicalZone.slice(0,-1)) ? raw : `${raw}.${canonicalZone.slice(0,-1)}`;
  if (fqdn.length > 253 || fqdn.split(".").some((label)=>label !== "*" && !isLabel(label, true))) throw new Error("Invalid DNS record name");
  if (!(fqdn === canonicalZone.slice(0,-1) || fqdn.endsWith(`.${canonicalZone.slice(0,-1)}`))) throw new Error("Record must be inside the zone");
  return `${fqdn}.`;
}

export function displayDnsName(name:string, zone:string):string {
  const canonicalName = name.toLowerCase().replace(/\.+$/, "");
  const canonicalZone = normalizeZoneName(zone).slice(0,-1);
  if (canonicalName === canonicalZone) return "@";
  return canonicalName.endsWith(`.${canonicalZone}`) ? canonicalName.slice(0,-canonicalZone.length-1) : canonicalName;
}

export function validateTtl(ttl:number):number {
  if (!Number.isInteger(ttl) || ttl < 30 || ttl > MAX_TTL) throw new Error(`TTL must be between 30 and ${MAX_TTL}`);
  return ttl;
}

export function normalizeRecordContent(type:RecordType, content:string):string {
  const value = content.trim();
  if (!value) throw new Error("Record content is required");
  if (type === "A" && isIP(value) !== 4) throw new Error("Invalid IPv4 address");
  if (type === "AAAA" && isIP(value) !== 6) throw new Error("Invalid IPv6 address");
  if (["CNAME","NS","PTR"].includes(type)) return normalizeTarget(value);
  if (type === "MX") return normalizeParts(value, 2, [0,65535], [1]);
  if (type === "SRV") return normalizeParts(value, 4, [0,65535], [3]);
  if (type === "CAA") {
    const match = value.match(/^(\d{1,3})\s+(issue|issuewild|iodef)\s+(.+)$/i);
    if (!match || Number(match[1]) > 255) throw new Error("CAA must be: flags tag value");
    return `${Number(match[1])} ${match[2].toLowerCase()} ${quote(match[3])}`;
  }
  if (type === "TXT") return quote(value);
  return value;
}

function normalizeParts(value:string, count:number, numericRange:[number,number], hostIndexes:number[]):string {
  const parts = value.split(/\s+/);
  if (parts.length !== count) throw new Error("Invalid record content format");
  parts.forEach((part,index)=>{
    if (!hostIndexes.includes(index)) {
      const number = Number(part); if (!Number.isInteger(number) || number < numericRange[0] || number > numericRange[1]) throw new Error("Invalid numeric field");
    }
  });
  hostIndexes.forEach((index)=>{ parts[index] = normalizeTarget(parts[index]); });
  return parts.join(" ");
}

function normalizeTarget(value:string):string {
  if (value === ".") return value;
  const target = value.replace(/\.+$/, "").toLowerCase();
  if (target.split(".").some((label)=>!isLabel(label, true))) throw new Error("Invalid hostname");
  return `${target}.`;
}

function isLabel(label:string, allowUnderscore=false):boolean {
  const body = allowUnderscore ? "[a-z0-9_]" : "[a-z0-9]";
  return new RegExp(`^(?!-)(?:${body}|-){1,63}(?<!-)$`, "i").test(label);
}
function quote(value:string):string { const unquoted=value.replace(/^"|"$/g,""); return `"${unquoted.replace(/(?<!\\)"/g,'\\"')}"`; }
