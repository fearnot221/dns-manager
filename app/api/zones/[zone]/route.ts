import { requireActor } from "@/lib/auth/session";
import { canDeleteZone, canManageZone } from "@/lib/auth/permissions";
import { normalizeZoneName } from "@/lib/dns/names";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, notFoundUnless } from "@/lib/api/respond";
import { logAuditEvent } from "@/lib/audit/service";

export async function GET(_request:Request,{params}:RouteContext<"/api/zones/[zone]">){try{const actor=await requireActor();const zoneName=normalizeZoneName(decodeURIComponent((await params).zone));notFoundUnless(canManageZone(actor,zoneName));const zone=await powerdns.getZone(zoneName);return Response.json({zone,permission:actor.globalRole==="SUPER_ADMIN"?"SUPER_ADMIN":actor.zoneRoles[zoneName]});}catch(error){return apiError(error);}}
export async function DELETE(request:Request,{params}:RouteContext<"/api/zones/[zone]">){let actor;let zoneName="";try{actor=await requireActor();zoneName=normalizeZoneName(decodeURIComponent((await params).zone));notFoundUnless(canManageZone(actor,zoneName));if(!canDeleteZone(actor))notFoundUnless(false);const current=await powerdns.getZone(zoneName);const confirmation=new URL(request.url).searchParams.get("confirm");if(confirmation!==zoneName.slice(0,-1))throw new Error("Zone confirmation does not match");await powerdns.deleteZone(zoneName);await logAuditEvent({actor,zone:zoneName,action:"DELETE_ZONE",before:current,success:true,request});return new Response(null,{status:204});}catch(error){if(actor)await logAuditEvent({actor,zone:zoneName,action:"DELETE_ZONE",success:false,errorMessage:error instanceof Error?error.message:"Unknown error",request}).catch(()=>undefined);return apiError(error);}}
