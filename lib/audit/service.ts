import "server-only";
import { db } from "@/lib/db/client";
import type { Actor } from "@/lib/dns/types";

export interface AuditInput { actor:Actor; zone:string; action:string; recordName?:string; recordType?:string; before?:unknown; after?:unknown; success:boolean; errorMessage?:string; request?:Request }
export async function logAuditEvent(input:AuditInput):Promise<void>{
  const ip=input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??input.request?.headers.get("x-real-ip");
  const safeError=input.errorMessage?.replace(/api[-_ ]?key\s*[:=]\s*\S+/gi,"[REDACTED]").slice(0,500);
  if(process.env.DATABASE_URL){await db.auditLog.create({data:{userId:input.actor.id==="dev-admin"?null:input.actor.id,userEmail:input.actor.email,zone:input.zone,recordName:input.recordName,recordType:input.recordType,action:input.action,oldValue:jsonValue(input.before),newValue:jsonValue(input.after),ipAddress:ip,userAgent:input.request?.headers.get("user-agent")?.slice(0,500),requestId:input.request?.headers.get("x-request-id")??crypto.randomUUID(),success:input.success,errorMessage:safeError}});}
  console.info(JSON.stringify({level:"info",userId:input.actor.id,zone:input.zone,action:input.action,status:input.success?"success":"failed"}));
}
function jsonValue(value:unknown){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
