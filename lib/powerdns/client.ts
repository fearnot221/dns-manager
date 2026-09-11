import "server-only";
import { z } from "zod";
import type { RRSet, Zone } from "@/lib/dns/types";
import { MOCK_ZONES } from "./mock-data";
import { PowerDNSError } from "./errors";
import { connectionEnvironment } from "./settings";

const zoneSchema=z.object({id:z.string(),name:z.string(),kind:z.enum(["Native","Master","Slave","Producer","Consumer"]),serial:z.number().default(0),dnssec:z.boolean().default(false),rrsets:z.array(z.any()).default([])});
const demoState = globalThis as typeof globalThis & { dnsMockZones?: Zone[] };
const mockZones:Zone[]=demoState.dnsMockZones ?? structuredClone(MOCK_ZONES);
if (process.env.NODE_ENV !== "production") demoState.dnsMockZones = mockZones;

export class PowerDNSClient {
  private readonly baseUrl:string; private readonly apiKey:string; private readonly serverId:string; private readonly mock:boolean;
  constructor(env:NodeJS.ProcessEnv=process.env){
    this.mock=env.PDNS_MOCK === "true";
    this.baseUrl=(env.PDNS_API_URL ?? "").replace(/\/$/,""); this.apiKey=env.PDNS_API_KEY ?? ""; this.serverId=env.PDNS_SERVER_ID ?? "localhost";
  }
  async listZones():Promise<Zone[]> { if(this.mock)return structuredClone(mockZones); const parsed = z.array(zoneSchema).safeParse(await this.request(`/servers/${encodeURIComponent(this.serverId)}/zones`)); if (!parsed.success) throw new PowerDNSError("DNS server returned an invalid zone list", 502); return parsed.data; }
  async getZone(name:string):Promise<Zone> { if(this.mock){const zone=mockZones.find((z)=>z.name===name);if(!zone)throw new PowerDNSError("Zone not found",404);return structuredClone(zone);} const parsed = zoneSchema.safeParse(await this.request(`/servers/${encodeURIComponent(this.serverId)}/zones/${encodeURIComponent(name)}`)); if (!parsed.success) throw new PowerDNSError("DNS server returned an invalid zone", 502); return parsed.data; }
  async createZone(input:{name:string;kind:string;nameservers:string[]}):Promise<Zone>{ if(this.mock){if(mockZones.some((z)=>z.name===input.name))throw new PowerDNSError("Zone already exists",409);const zone:Zone={id:input.name,name:input.name,kind:input.kind as Zone["kind"],serial:0,dnssec:false,rrsets:[]};mockZones.push(zone);return structuredClone(zone);} return this.request(`/servers/${encodeURIComponent(this.serverId)}/zones`,{method:"POST",body:JSON.stringify({name:input.name,kind:input.kind,nameservers:input.nameservers})}); }
  async deleteZone(name:string):Promise<void>{ if(this.mock){const index=mockZones.findIndex((z)=>z.name===name);if(index<0)throw new PowerDNSError("Zone not found",404);mockZones.splice(index,1);return;} await this.request(`/servers/${encodeURIComponent(this.serverId)}/zones/${encodeURIComponent(name)}`,{method:"DELETE"}); }
  async replaceRRSet(zone:string,rrset:RRSet):Promise<void>{ if(this.mock){const target=mockZones.find((z)=>z.name===zone);if(!target)throw new PowerDNSError("Zone not found",404);const index=target.rrsets.findIndex((r)=>r.name===rrset.name&&r.type===rrset.type);if(index<0)target.rrsets.push(structuredClone(rrset));else target.rrsets[index]=structuredClone(rrset);target.serial+=1;return;} await this.patch(zone,{...rrset,changetype:"REPLACE"}); }
  async deleteRRSet(zone:string,name:string,type:string):Promise<void>{ if(this.mock){const target=mockZones.find((z)=>z.name===zone);if(!target)throw new PowerDNSError("Zone not found",404);target.rrsets=target.rrsets.filter((r)=>!(r.name===name&&r.type===type));target.serial+=1;return;} await this.patch(zone,{name,type,changetype:"DELETE"}); }
  async updateZone(zone:string,data:Record<string,unknown>):Promise<void>{ if(this.mock)return; await this.request(`/servers/${encodeURIComponent(this.serverId)}/zones/${encodeURIComponent(zone)}`,{method:"PUT",body:JSON.stringify(data)}); }
  async enableDNSSEC(zone:string):Promise<void>{ await this.updateZone(zone,{dnssec:true}); }
  async disableDNSSEC(zone:string):Promise<void>{ await this.updateZone(zone,{dnssec:false}); }
  async getServerStatistics():Promise<unknown>{ if(this.mock)return [{name:"uptime",value:"987654"}]; return this.request(`/servers/${encodeURIComponent(this.serverId)}/statistics`); }
  private async patch(zone:string,rrset:Record<string,unknown>):Promise<void>{ await this.request(`/servers/${encodeURIComponent(this.serverId)}/zones/${encodeURIComponent(zone)}`,{method:"PATCH",body:JSON.stringify({rrsets:[rrset]})}); }
  private async request<T>(path:string,init:RequestInit={}):Promise<T>{
    if(!this.baseUrl||!this.apiKey)throw new PowerDNSError("PowerDNS server configuration is missing",503);
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),8000);
    try { const response=await fetch(`${this.baseUrl}${path}`,{...init,cache:"no-store",signal:controller.signal,redirect:"error",headers:{"X-API-Key":this.apiKey,"Content-Type":"application/json",...init.headers}});
      if(!response.ok){const detail=(await response.text()).slice(0,500);throw new PowerDNSError(response.status===404?"Resource not found":"DNS server request failed",response.status,detail);}
      if(response.status===204)return undefined as T;
      return await response.json() as T;
    } catch(error){if(error instanceof PowerDNSError)throw error;throw new PowerDNSError("Unable to connect to DNS server",502,error instanceof Error?error.message:"Unknown error");} finally {clearTimeout(timer);}
  }
}

export const powerdns = new Proxy({} as PowerDNSClient, {
  get(_target, method: keyof PowerDNSClient) {
    return async (...args: unknown[]) => {
      const client = new PowerDNSClient(await connectionEnvironment());
      const operation = client[method] as (...values: unknown[]) => unknown;
      return operation.apply(client, args);
    };
  },
});
