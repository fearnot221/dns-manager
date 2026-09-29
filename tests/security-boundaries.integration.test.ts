/** Disposable localhost DB only; no live PowerDNS or identity provider. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth/session",()=>({requireActor:vi.fn(),AuthError:class extends Error{}}));
vi.mock("@/lib/audit/service",()=>({logAuditEvent:vi.fn(async()=>undefined)}));
vi.mock("@/lib/db/client",async()=>{const {PrismaClient}=await import("@prisma/client");return {db:new PrismaClient({datasourceUrl:process.env.UNIT_TEST_DATABASE_URL||"postgresql://unused@127.0.0.1:1/unused"})};});
vi.mock("@/lib/powerdns/settings",()=>({connectionEnvironment:async()=>({PDNS_MOCK:"true"})}));
vi.mock("@/lib/powerdns/client",()=>({powerdns:{getZone:vi.fn(),listZones:vi.fn(),replaceRRSet:vi.fn(),deleteRRSet:vi.fn()}}));
import { db } from "@/lib/db/client";
import { powerdns } from "@/lib/powerdns/client";
import { requireActor } from "@/lib/auth/session";
import { consumeBudgets,allowPasswordAttempt,privateBudgetKey } from "@/lib/security/rate-limit";
import { assertUnitRequestBudget } from "@/lib/requests/limits";
import { lockUnit } from "@/lib/units/service";
import { GET as listRequests } from "@/app/api/dns-requests/route";
import { PATCH as reviewRequest } from "@/app/api/dns-requests/[id]/route";
import { GET as records,POST as addRecord,DELETE as deleteRecord } from "@/app/api/zones/[zone]/records/route";
import { saveInventory,listInventory,recordId } from "@/lib/inventory/service";
import { rrsetHash } from "@/lib/dns/rrset";
import { canManageWholeZone } from "@/lib/auth/permissions";
import type { Actor,Zone } from "@/lib/dns/types";
const url=process.env.UNIT_TEST_DATABASE_URL;
let actor:Actor,unitId:string,zone:Zone;
const fixture=(name:string)=>({userId:actor.id,unitId,zoneName:zone.name,recordName:`${name}.${zone.name}`,recordType:"A",content:"192.0.2.1",ttl:300,status:"PENDING" as const});
describe.skipIf(!url)("security budgets, scoped API access and review serialization",()=>{
 beforeAll(()=>{const target=new URL(url!);if(!["127.0.0.1","localhost"].includes(target.hostname)||target.pathname!=="/dns_units_test")throw Error("Disposable local DB required");});
 beforeEach(async()=>{
  vi.clearAllMocks();vi.stubEnv("DATABASE_URL",url!);vi.stubEnv("NODE_ENV","production");vi.stubEnv("AUTH_SECRET","isolated-test-secret-not-a-real-credential");
  const user=await db.user.create({data:{email:`${crypto.randomUUID()}@security.invalid`,globalRole:"ADMIN"}});
  actor={id:user.id,email:user.email,globalRole:"ADMIN",zoneRoles:{}};
  const unit=await db.dnsUnit.create({data:{name:`security-${crypto.randomUUID()}`,members:{create:{userId:actor.id,role:"EDITOR"}}}});unitId=unit.id;
  zone={id:"example.test.",name:"example.test.",kind:"Native",serial:1,dnssec:false,rrsets:[]};
  vi.mocked(requireActor).mockResolvedValue(actor);
  vi.mocked(powerdns.getZone).mockImplementation(async()=>structuredClone(zone));
  vi.mocked(powerdns.listZones).mockImplementation(async()=>[structuredClone(zone)]);
  vi.mocked(powerdns.replaceRRSet).mockImplementation(async(_zone,rrset)=>{zone.rrsets=zone.rrsets.filter(r=>r.name!==rrset.name||r.type!==rrset.type).concat(structuredClone(rrset));});
 });
 afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
 afterAll(async()=>{await db.$disconnect();});
 it("admits only one of two concurrent attempts sharing a persistent budget",async()=>{
  const key=`test:${crypto.randomUUID()}`;
  const results=await Promise.all([consumeBudgets([{key,limit:1,windowMs:60000}]),consumeBudgets([{key,limit:1,windowMs:60000}])]);
  expect(results.sort()).toEqual([false,true]);
  expect((await db.securityRateLimit.findUniqueOrThrow({where:{key}})).count).toBe(2);
  await db.securityRateLimit.update({where:{key},data:{expiresAt:new Date(0)}});
  expect(await consumeBudgets([{key,limit:1,windowMs:60000}])).toBe(true);
 });
 it("does not create unlimited account keys after the global password budget is spent",async()=>{
  await db.securityRateLimit.upsert({where:{key:"password-login:global"},create:{key:"password-login:global",count:300,expiresAt:new Date(Date.now()+60000)},update:{count:300,expiresAt:new Date(Date.now()+60000)}});
  const email=`${crypto.randomUUID()}@unknown.invalid`;
  expect(await allowPasswordAttempt(email)).toBe(false);
  expect(await db.securityRateLimit.findUnique({where:{key:privateBudgetKey("password-login:account",email)}})).toBeNull();
  await db.securityRateLimit.delete({where:{key:"password-login:global"}});
 });
 it("checks both pending and rolling daily quota under the same unit lock",async()=>{
  vi.stubEnv("DNS_UNIT_MAX_PENDING_RECORDS","1");vi.stubEnv("DNS_UNIT_MAX_DAILY_RECORDS","10");
  const submit=()=>db.$transaction(async tx=>{await lockUnit(tx,unitId);await assertUnitRequestBudget(tx,unitId,1);return tx.dnsRecordRequest.create({data:fixture(crypto.randomUUID())});});
  const results=await Promise.allSettled([submit(),submit()]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(await db.dnsRecordRequest.count({where:{unitId}})).toBe(1);
  vi.stubEnv("DNS_UNIT_MAX_PENDING_RECORDS","10");vi.stubEnv("DNS_UNIT_MAX_DAILY_RECORDS","1");
  await db.dnsRecordRequest.updateMany({where:{unitId},data:{status:"REJECTED"}});
  await expect(submit()).rejects.toMatchObject({status:429});
 });
 it("bounds storage bytes as well as record counts, including after requests are rejected",async()=>{
  const item=await db.dnsRecordRequest.create({data:{...fixture("byte-budget"),content:"x".repeat(4096)}});
  vi.stubEnv("DNS_UNIT_MAX_PENDING_BYTES","1024");
  await expect(db.$transaction(async tx=>{await lockUnit(tx,unitId);await assertUnitRequestBudget(tx,unitId,1,100);})).rejects.toMatchObject({status:429});
  vi.stubEnv("DNS_UNIT_MAX_PENDING_BYTES","100000");vi.stubEnv("DNS_UNIT_MAX_DAILY_BYTES","1024");
  await db.dnsRecordRequest.update({where:{id:item.id},data:{status:"REJECTED"}});
  await expect(db.$transaction(async tx=>{await lockUnit(tx,unitId);await assertUnitRequestBudget(tx,unitId,1,100);})).rejects.toMatchObject({status:429});
 });
 it("keeps all historical rows accessible through bounded pages and global search",async()=>{
  await db.dnsRecordRequest.createMany({data:Array.from({length:101},(_,i)=>fixture(i===100?"needle-final":`page-${i}`))});
  const base=`http://localhost/api/dns-requests?unitId=${unitId}`;
  const first=await (await listRequests(new Request(base))).json();
  expect(first.total).toBe(101);expect(first.requests).toHaveLength(100);expect(first.counts.PENDING).toBe(101);expect(first.nextCursor).toBeTruthy();
  const second=await (await listRequests(new Request(base+`&cursor=${first.nextCursor}`))).json();
  expect(second.requests).toHaveLength(1);expect(second.nextCursor).toBeNull();
  expect(new Set([...first.requests,...second.requests].map(r=>r.id)).size).toBe(101);
  const found=await (await listRequests(new Request(base+"&q=needle-final"))).json();expect(found.total).toBe(1);
  const bad=await listRequests(new Request(base+"&cursor=malformed"));expect(bad.status).toBe(400);
 });
 it("filters DNS and inventory reads and rejects scope/type bypass at write sinks",async()=>{
  actor={...actor,globalRole:"USER",zoneRoles:{[zone.name]:"ADMIN"},zoneGrants:[{zoneName:zone.name,role:"ADMIN",resourcePattern:"*.lab.example.test.",allowedRecordTypes:["A"]},{zoneName:zone.name,role:"EDITOR",resourcePattern:"outside.example.test."}]};vi.mocked(requireActor).mockResolvedValue(actor);
  zone.rrsets=["in.lab.example.test.","outside.example.test."].map(name=>({name,type:"A",ttl:300,records:[{content:"192.0.2.1",disabled:false}]}));
  const response=await records(new Request("http://localhost"),{params:Promise.resolve({zone:zone.name})});
  expect((await response.json()).rrsets.map((r:{name:string})=>r.name)).toEqual(["in.lab.example.test."]);
  expect((await listInventory(actor)).map(r=>r.recordName)).toEqual(["in.lab.example.test."]);
  vi.mocked(powerdns.getZone).mockClear();
  for(const [name,type,content] of [["outside.example.test.","A","192.0.2.2"],["in.lab.example.test.","TXT","test"]]){
   const result=await addRecord(new Request("http://localhost/api/zones/example.test/records",{method:"POST",body:JSON.stringify({name,type,content,ttl:300})}),{params:Promise.resolve({zone:zone.name})});expect(result.status).toBe(404);
  }
  const deniedDelete=await deleteRecord(new Request("http://localhost/api/zones/example.test/records",{method:"DELETE",body:JSON.stringify({name:"outside.example.test.",type:"A",expectedHash:rrsetHash(zone.rrsets[1]),deletionPassword:"fixture-password"})}),{params:Promise.resolve({zone:zone.name})});
  expect(deniedDelete.status).toBe(404);expect(powerdns.deleteRRSet).not.toHaveBeenCalled();expect(powerdns.getZone).not.toHaveBeenCalled();
  expect(powerdns.replaceRRSet).not.toHaveBeenCalled();expect(canManageWholeZone(actor,zone.name)).toBe(false);
  const identity={zoneName:zone.name,recordName:"outside.example.test.",recordType:"A",content:"192.0.2.1"};
  await expect(saveInventory(actor,{...identity,id:recordId("local-mock",identity),expectedUpdatedAt:null,mode:"metadata",applicantName:"",applicantEmail:"",applicantUnit:"",applicantExtension:"",purpose:"",note:""})).rejects.toMatchObject({status:404});
  const good=await addRecord(new Request("http://localhost/api/zones/example.test/records",{method:"POST",body:JSON.stringify({name:"new.lab.example.test.",type:"A",content:"192.0.2.2",ttl:300})}),{params:Promise.resolve({zone:zone.name})});expect(good.status).toBe(200);
 });
 it("does not leak another user's scope-external requests through the paged list",async()=>{
  const other=await db.user.create({data:{email:`${crypto.randomUUID()}@other.invalid`}});
  await db.dnsRecordRequest.createMany({data:[{...fixture("in.lab"),unitId:null},{...fixture("outside"),unitId:null}].map(r=>({...r,userId:other.id}))});
  actor={...actor,globalRole:"USER",zoneRoles:{[zone.name]:"ADMIN"},zoneGrants:[{zoneName:zone.name,role:"ADMIN",resourcePattern:"*.lab.example.test."}]};vi.mocked(requireActor).mockResolvedValue(actor);
  const result=await (await listRequests(new Request(`http://localhost/api/dns-requests?q=${other.id}`))).json();expect(result.requests).toHaveLength(0);
  const list=await (await listRequests(new Request("http://localhost/api/dns-requests"))).json();
  expect(list.requests.some((r:{user:{id:string};recordName:string})=>r.user.id===other.id&&r.recordName==="outside.example.test.")).toBe(false);
  expect(list.requests.some((r:{user:{id:string};recordName:string})=>r.user.id===other.id&&r.recordName==="in.lab.example.test.")).toBe(true);
 });
 it.each(["APPROVE","REJECT"] as const)("serializes legacy review with %s first, preserving consistent DNS/state",async firstDecision=>{
  const item=await db.dnsRecordRequest.create({data:{...fixture(crypto.randomUUID()),unitId:null}});
  let snapshotsRead!:()=>void;let outsideReads=0;
  const snapshotsReady=new Promise<void>(resolve=>{snapshotsRead=resolve;});
  const originalRead=db.dnsRecordRequest.findUnique.bind(db.dnsRecordRequest);
  vi.spyOn(db.dnsRecordRequest,"findUnique").mockImplementation(new Proxy(originalRead,{apply(_target,_this,args){
    return Reflect.apply(originalRead,undefined,args).then((row:{id:string;status:string}|null)=>{
      if(row?.id===item.id&&outsideReads<2){outsideReads++;if(outsideReads===2)snapshotsRead();}return row;
    });
  }}));
  let release!:()=>void,entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});const wait=new Promise<void>(resolve=>{release=resolve;});
  // Hold the request row from an independent transaction; queue both decisions.
  const blocker=db.$transaction(async tx=>{await tx.$queryRaw`SELECT "id" FROM "DnsRecordRequest" WHERE "id"=${item.id} FOR UPDATE`;entered();await wait;},{timeout:10000});
  await started;
  const call=(decision:string)=>reviewRequest(new Request(`http://localhost/api/dns-requests/${item.id}`,{method:"PATCH",body:JSON.stringify({decision})}),{params:Promise.resolve({id:item.id})});
  // Ensure both initial snapshots are PENDING before releasing the real row lock.
  const a=call(firstDecision);const b=call(firstDecision==="APPROVE"?"REJECT":"APPROVE");
  await snapshotsReady;release();await blocker;
  const responses=await Promise.all([a,b]);expect(responses.map(r=>r.status).sort()).toEqual([200,409]);
  const saved=await db.dnsRecordRequest.findUniqueOrThrow({where:{id:item.id}});
  const published=zone.rrsets.some(r=>r.name===item.recordName);
  expect(published).toBe(saved.status==="APPROVED");
 });
});
