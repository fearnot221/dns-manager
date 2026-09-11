import { describe,expect,it } from "vitest";
import { addRecord, removeRecord, rrsetHash } from "@/lib/dns/rrset";
const base={name:"www.example.com.",type:"A" as const,ttl:300,records:[{content:"1.1.1.1",disabled:false}]};
describe("RRset operations",()=>{
  it("preserves existing values when adding",()=>expect(addRecord(base,base,"1.0.0.1").records.map((r)=>r.content)).toEqual(["1.1.1.1","1.0.0.1"]));
  it("removes one value without deleting the RRset",()=>expect(removeRecord({...base,records:[...base.records,{content:"1.0.0.1",disabled:false}]},"1.1.1.1")?.records).toHaveLength(1));
  it("deletes an empty RRset",()=>expect(removeRecord(base,"1.1.1.1")).toBeUndefined());
  it("detects stale state",()=>expect(rrsetHash(base)).not.toBe(rrsetHash({...base,ttl:600})));
});
