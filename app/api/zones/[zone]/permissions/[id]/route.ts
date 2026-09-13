import { auditMutation } from "@/lib/audit/mutation";
import { OWNER_IDENTIFIER } from "@/lib/auth/owner";
import { requireActor } from "@/lib/auth/session";
import { canManagePermissions, canViewZone } from "@/lib/auth/permissions";
import { apiError, ApiError, notFoundUnless } from "@/lib/api/respond";
import { logAuditEvent } from "@/lib/audit/service";
import { normalizeZoneName } from "@/lib/dns/names";
import { db } from "@/lib/db/client";
import { mockPermissions } from "@/lib/mock/permissions";

async function DELETEHandler(request:Request,{params}:{params:Promise<{zone:string;id:string}>}){
  let actor;let zone="";
  try{
    const resolved=await params;actor=await requireActor();zone=normalizeZoneName(decodeURIComponent(resolved.zone));notFoundUnless(canViewZone(actor,zone)&&canManagePermissions(actor,zone));let previous:unknown;
    if(!process.env.DATABASE_URL){const index=mockPermissions.findIndex((item)=>item.id===resolved.id);if(index<0)throw new ApiError("Permission not found",404);if(mockPermissions[index].userId==="dev-owner")throw new ApiError("最高使用者受保護。",403);previous=mockPermissions[index];mockPermissions.splice(index,1);}
    else{const permission=await db.zonePermission.findFirst({where:{id:resolved.id,zoneName:zone},include:{user:{select:{accounts:{where:{provider:"ncu-portal"},select:{providerAccountId:true}}}}}});if(permission&&permission.user.accounts.some((a)=>a.providerAccountId===OWNER_IDENTIFIER))throw new ApiError("最高使用者受保護。",403);previous=await db.zonePermission.findFirst({where:{id:resolved.id,zoneName:zone}});if(!previous)throw new ApiError("Permission not found",404);await db.zonePermission.delete({where:{id:resolved.id}});}
    await logAuditEvent({actor,zone,action:"UPDATE_PERMISSION",before:previous,after:null,success:true,request});return new Response(null,{status:204});
  }catch(error){if(actor)await logAuditEvent({actor,zone,action:"UPDATE_PERMISSION",success:false,errorMessage:error instanceof Error?error.message:"Unknown error",request}).catch(()=>undefined);return apiError(error);}
}

export const DELETE = auditMutation(DELETEHandler);
