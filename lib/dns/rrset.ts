import { createHash } from "node:crypto";
import type { RRSet } from "./types";

export function rrsetHash(rrset:RRSet|undefined):string { return createHash("sha256").update(JSON.stringify(rrset??null)).digest("base64url"); }
export function addRecord(rrset:RRSet|undefined,base:Pick<RRSet,"name"|"type"|"ttl">,content:string):RRSet {
  const records=rrset?.records??[];
  if(records.some((record)=>record.content===content))throw new Error("This value already exists in the RRset");
  return {...base,records:[...records,{content,disabled:false}]};
}
export function removeRecord(rrset:RRSet,content?:string):RRSet|undefined {
  if(content===undefined)return undefined;
  const records=rrset.records.filter((record)=>record.content!==content);
  if(records.length===rrset.records.length)throw new Error("Record value not found");
  return records.length?{...rrset,records}:undefined;
}
