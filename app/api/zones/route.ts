import { requireActor } from "@/lib/auth/session";
import { effectiveZoneRole, canCreateZone, canManageZone } from "@/lib/auth/permissions";
import { normalizeZoneName } from "@/lib/dns/names";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, ApiError } from "@/lib/api/respond";
import { createZoneSchema } from "@/lib/validation/api";
import { logAuditEvent } from "@/lib/audit/service";

export async function GET(){try{const actor=await requireActor();const zones=await powerdns.listZones();return Response.json({zones:zones.filter((zone)=>canManageZone(actor,zone.name)).map((zone)=>({...zone,rrsets:undefined,recordCount:zone.rrsets.reduce((n,r)=>n+r.records.length,0),permission:effectiveZoneRole(actor,zone.name)}))});}catch(error){return apiError(error);}}
export async function POST(request:Request){let actor;let name="";try{actor=await requireActor();if(!canCreateZone(actor))throw new ApiError("Forbidden",403);const parsed=createZoneSchema.parse(await request.json());name=normalizeZoneName(parsed.name);const zone=await powerdns.createZone({...parsed,name,nameservers:parsed.nameservers.map((n)=>normalizeZoneName(n))});await logAuditEvent({actor,zone:name,action:"CREATE_ZONE",after:zone,success:true,request});return Response.json({zone},{status:201});}catch(error){if(actor)await logAuditEvent({actor,zone:name,action:"CREATE_ZONE",success:false,errorMessage:error instanceof Error?error.message:"Unknown error",request}).catch(()=>undefined);return apiError(error);}}
