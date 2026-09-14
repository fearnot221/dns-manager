import "server-only";
import { db } from "@/lib/db/client";
import type { Actor } from "@/lib/dns/types";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { redactAudit } from "./redact";

export type AuditEvent = { id: string; createdAt: string; userId: string | null; userEmail: string; userName?: string | null; userDisplayEmail?: string | null; zone: string; recordName?: string | null; recordType?: string | null; action: string; oldValue?: unknown; newValue?: unknown; ipAddress?: string | null; userAgent?: string | null; requestId: string; success: boolean; errorMessage?: string | null };
export const localAuditEvents = () => localDocument<{ events: AuditEvent[] }, AuditEvent[]>("audit", async () => ({ events: [] }), (data) => data.events);

export interface AuditInput { actor:Actor; zone:string; action:string; recordName?:string; recordType?:string; before?:unknown; after?:unknown; success:boolean; errorMessage?:string; request?:Request }
export async function logAuditEvent(input:AuditInput):Promise<void>{
  const ip=input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??input.request?.headers.get("x-real-ip");
  const safeError = String(redactAudit(input.errorMessage ?? "")).slice(0, 500);
  const data = { userId: !input.actor.id || input.actor.id.startsWith("dev-") ? null : input.actor.id, userEmail: input.actor.email, zone: input.zone, recordName: input.recordName, recordType: input.recordType, action: input.action, oldValue: jsonValue(input.before), newValue: jsonValue(input.after), ipAddress: ip, userAgent: input.request?.headers.get("user-agent")?.slice(0,500), requestId: input.request?.headers.get("x-request-id")?.slice(0,100) || crypto.randomUUID(), success: input.success, errorMessage: safeError };
  if(process.env.DATABASE_URL) await db.auditLog.create({data});
  else if (isLocalDemo()) await localDocument<{ events: AuditEvent[] }, void>("audit", async () => ({ events: [] }), (store) => { store.events.push({ ...data, userName: input.actor.name, id: crypto.randomUUID(), createdAt: new Date().toISOString() }); }, true);
  else throw new Error("Audit storage unavailable");
  console.info(JSON.stringify({level:"info",userId:input.actor.id,zone:input.zone,action:input.action,status:input.success?"success":"failed"}));
}
function jsonValue(value:unknown){return value===undefined?undefined:JSON.parse(JSON.stringify(redactAudit(value)));}
