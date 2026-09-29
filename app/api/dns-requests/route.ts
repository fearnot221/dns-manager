import { auditMutation } from "@/lib/audit/mutation";
import { applicationZoneNames } from "@/lib/requests/zone-access";
import { powerdns } from "@/lib/powerdns/client";
import { requestListQuery,requestPageSize,encodeRequestCursor } from "@/lib/requests/list-query";
import { filterRequests,scopeRequests } from "@/components/requests/model";
import { dnsApplicationSchema } from "@/lib/validation/api";
import { assertApplicationPolicy } from "@/lib/requests/policy";
import { ApplicationInputError, prepareApplication } from "@/lib/requests/application";
import { saveApplication } from "@/lib/requests/save-application";
import { canReviewDnsRequest } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { apiError, ApiError } from "@/lib/api/respond";
import { logAuditEvent } from "@/lib/audit/service";
import { isDevRequestStore, listDevRequests } from "@/lib/requests/dev-store";

export async function GET(request:Request=new Request("http://localhost/api/dns-requests")) {
  try {
    const actor=await requireActor();
    const query=requestListQuery(actor,request.url);
    if(isDevRequestStore()){
      const visible=listDevRequests(actor).filter(()=>!query.input.unitId).map(item=>({...item,createdAt:item.createdAt.toISOString(),reviewedAt:item.reviewedAt?.toISOString()??null,canReview:item.status==="PENDING"&&canReviewDnsRequest(actor,item)}));
      const base=filterRequests(scopeRequests(visible,query.input.scope,actor.id),query.input.q,"ALL");
      const counts=Object.fromEntries(["PENDING","APPROVED","REJECTED","CANCELLED"].map(status=>[status,base.filter(item=>item.status===status).length]));
      let rows=base.filter(item=>query.input.status==="ALL"||item.status===query.input.status).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
      const total=rows.length;
      if(query.input.cursor){const c=JSON.parse(Buffer.from(query.input.cursor,"base64url").toString());rows=rows.filter(item=>item.createdAt<c.createdAt||item.createdAt===c.createdAt&&item.id<c.id);}
      const page=rows.slice(0,requestPageSize);
      return Response.json({scope:query.scope,requests:page,total,counts:{...counts,ALL:base.length},nextCursor:rows.length>requestPageSize?encodeRequestCursor({...page.at(-1)!,createdAt:new Date(page.at(-1)!.createdAt)}):null},{headers:{"Cache-Control":"private, no-store"}});
    }
    const [rows,total,counts]=await db.$transaction([
      db.dnsRecordRequest.findMany({where:query.where,include:{user:{select:{id:true,name:true,studentId:true}},reviewer:{select:{name:true,email:true}}},orderBy:[{createdAt:"desc"},{id:"desc"}],take:requestPageSize+1}),
      db.dnsRecordRequest.count({where:query.selected}),
      db.dnsRecordRequest.groupBy({by:["status"],where:query.base,orderBy:{status:"asc"},_count:{_all:true}}),
    ]);
    const page=rows.slice(0,requestPageSize);
    return Response.json({scope:query.scope,total,counts:{...Object.fromEntries(counts.map(row=>[row.status,(typeof row._count==="object" ? row._count._all??0 : 0)])),ALL:counts.reduce((sum,row)=>sum+(typeof row._count==="object" ? row._count._all??0 : 0),0)},nextCursor:rows.length>requestPageSize?encodeRequestCursor(page.at(-1)!):null,requests:page.map(({expectedRRSet:_snapshot,connectionScope:_scope,...item})=>{
      void _snapshot;void _scope;return {...item,user:{id:item.user.id,name:item.user.name,studentId:item.user.studentId,email:null},canReview:item.status==="PENDING"&&canReviewDnsRequest(actor,item)};
    })},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error){return apiError(error);}
}

async function POSTHandler(request: Request) {
  let actor;
  try {
    actor = await requireActor();
    const body = await request.json().catch(() => { throw new ApiError("申請資料格式不正確。", 400); });
    const parsed=dnsApplicationSchema.safeParse(body);
    if(!parsed.success) prepareApplication(body,[]); // preserve field-specific error messages
    const preview=prepareApplication(body,parsed.data!.records.map(r=>r.zoneName));
    await assertApplicationPolicy(actor,preview.records.map(r=>r.recordType),preview.unitId);
    const zones = await powerdns.listZones();
    const input = prepareApplication(body, await applicationZoneNames(zones.map((zone) => zone.name)));
    const saved = await saveApplication(actor, input, request);
    return Response.json(saved, { status: 201 });
  } catch (error) {
    if (actor) await logAuditEvent({ actor, zone: "", action: "REQUEST_DNS_APPLICATION", success: false, errorMessage: error instanceof Error ? error.message : "Unknown error", request }).catch(() => undefined);
    return apiError(error instanceof ApplicationInputError ? new ApiError(error.message, error.status) : error);
  }
}

export const POST = auditMutation(POSTHandler);
