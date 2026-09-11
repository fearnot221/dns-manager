import { requireActor } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { apiError, ApiError } from "@/lib/api/respond";
export async function GET(){try{const actor=await requireActor();if(actor.globalRole!=="SUPER_ADMIN")throw new ApiError("Forbidden",403);const started=performance.now();const zones=await powerdns.listZones();const latency=Math.round(performance.now()-started);return Response.json({powerdns:{status:"online",latency,mode:process.env.PDNS_MOCK==="true"?"mock":"live"},database:{status:process.env.DATABASE_URL?"configured":"mock"},zones:zones.length,records:zones.reduce((n,z)=>n+z.rrsets.reduce((m,r)=>m+r.records.length,0),0),checkedAt:new Date().toISOString()});}catch(error){return apiError(error);}}
