import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/dns/types";
import { recordMatchesPattern } from "@/lib/auth/permissions";
export const requestPageSize=100;
const schema=z.object({q:z.string().trim().max(200).default(""),status:z.enum(["ALL","PENDING","APPROVED","REJECTED","CANCELLED"]).default("ALL"),scope:z.enum(["ALL","MINE","SHARED","REVIEWABLE"]).default("ALL"),unitId:z.string().max(100).optional(),cursor:z.string().max(500).optional()});
const cursorSchema=z.object({createdAt:z.iso.datetime(),id:z.string().min(1).max(100)});
export function encodeRequestCursor(row:{createdAt:Date;id:string}) {return Buffer.from(JSON.stringify({createdAt:row.createdAt.toISOString(),id:row.id})).toString("base64url");}
export function requestListQuery(actor:Actor,url:string) {
  const input=schema.parse(Object.fromEntries(new URL(url).searchParams));
  const global=actor.globalRole==="ADMIN"||actor.globalRole==="SUPER_ADMIN";
  const zones:Prisma.DnsRecordRequestWhereInput[]=actor.zoneGrants ? actor.zoneGrants.filter(g=>g.role==="ADMIN").flatMap(g=>{
    // Fail closed for invalid legacy patterns, identical to record authorization.
    const pattern=g.resourcePattern?.trim();
    const candidate=pattern?.startsWith("*.")?`test.${pattern.slice(2)}`:pattern??g.zoneName;
    if (!recordMatchesPattern(candidate,g.zoneName,g.resourcePattern)) return [];
    const name=pattern?.startsWith("*.") ? {endsWith:`.${pattern.slice(2).toLowerCase().replace(/\.+$/,"")}.`} : pattern ? {equals:`${pattern.toLowerCase().replace(/\.+$/,"")}.`} : undefined;
    return [{zoneName:g.zoneName,...(name?{recordName:name}:{}),...(g.allowedRecordTypes?.length?{recordType:{in:g.allowedRecordTypes}}:{})}];
  }):Object.entries(actor.zoneRoles).filter(([,role])=>role==="ADMIN").map(([zoneName])=>({zoneName}));
  const access:Prisma.DnsRecordRequestWhereInput=global?{}:{OR:[{userId:actor.id},{unit:{members:{some:{userId:actor.id}}}},...zones]};
  const filters:Prisma.DnsRecordRequestWhereInput[]=[access];
  if(input.unitId)filters.push({unitId:input.unitId});
  if(input.scope==="MINE")filters.push({userId:actor.id});
  if(input.scope==="SHARED")filters.push({unitId:{not:null}});
  if(input.scope==="REVIEWABLE")filters.push(global?{status:"PENDING"}:{status:"PENDING",unitId:null,OR:zones.length?zones:[{id:""}]});
  if(input.q){
    const fields=["zoneName","recordName","recordType","content","applicantName","applicantEmail","recordPurpose","applicantUnit","applicantExtension","purpose","reviewNote"];
    const contains={contains:input.q,mode:"insensitive" as const};
    filters.push({OR:[...fields.map(field=>({[field]:contains})),{user:{name:contains}},{user:{studentId:contains}}]});
  }
  const base:Prisma.DnsRecordRequestWhereInput={AND:filters};
  const selected:Prisma.DnsRecordRequestWhereInput={AND:[base,...(input.status!=="ALL"?[{status:input.status}]:[])]};
  const page:Prisma.DnsRecordRequestWhereInput[]=[selected];
  if(input.cursor){
    let decoded:unknown;try{decoded=JSON.parse(Buffer.from(input.cursor,"base64url").toString());}catch{decoded=null;}
    const cursor=cursorSchema.parse(decoded);const createdAt=new Date(cursor.createdAt);
    page.push({OR:[{createdAt:{lt:createdAt}},{createdAt,id:{lt:cursor.id}}]});
  }
  return {input,base,selected,where:{AND:page} satisfies Prisma.DnsRecordRequestWhereInput,scope:global||zones.length?"ADMIN":"USER"};
}
