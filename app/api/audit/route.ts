import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiError } from "@/lib/api/respond";
import { MOCK_AUDIT } from "@/lib/mock/app-data";

export async function GET(request:Request){try{const actor=await requireActor();const query=new URL(request.url).searchParams;const zone=query.get("zone")||undefined;const action=query.get("action")||undefined;if(!process.env.DATABASE_URL)return Response.json({events:MOCK_AUDIT.filter((e)=>(actor.globalRole==="SUPER_ADMIN"||Boolean(actor.zoneRoles[e.zone]))&&(!zone||e.zone===zone)&&(!action||e.action===action))});const events=await db.auditLog.findMany({where:{...(zone?{zone}:{}),...(action?{action}:{}),...(actor.globalRole==="SUPER_ADMIN"?{}:{zone:{in:Object.keys(actor.zoneRoles)}})},orderBy:{createdAt:"desc"},take:200});return Response.json({events});}catch(error){return apiError(error);}}
