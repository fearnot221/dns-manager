import type { AuditEvent } from "@/lib/dns/types";
export const MOCK_AUDIT:AuditEvent[]=[
  {id:"1",createdAt:"2026-09-09T09:42:00Z",userEmail:"admin@example.com",zone:"example.com.",recordName:"www.example.com.",recordType:"A",action:"UPDATE_RECORD",before:{records:["140.115.154.20"]},after:{records:["140.115.154.30"]},success:true},
  {id:"2",createdAt:"2026-09-09T08:10:00Z",userEmail:"alice@example.com",zone:"example.com.",recordName:"example.com.",recordType:"MX",action:"CREATE_RECORD",after:{records:["10 mail.example.com."]},success:true},
  {id:"3",createdAt:"2026-09-08T15:18:00Z",userEmail:"admin@example.com",zone:"internal.example.com.",action:"UPDATE_PERMISSION",before:{role:"VIEWER"},after:{role:"EDITOR"},success:true},
  {id:"4",createdAt:"2026-09-08T13:04:00Z",userEmail:"bob@example.com",zone:"example.com.",recordName:"example.com.",recordType:"NS",action:"DELETE_RECORD",success:false,errorMessage:"Protected records require the Admin role"},
];
export const MOCK_USERS=[
  {id:"dev-admin",name:"Fearnot Admin",email:"admin@example.com",globalRole:"SUPER_ADMIN",zones:3,lastLoginAt:"Now",createdAt:"Aug 12, 2026"},
  {id:"alice",name:"Alice Lin",email:"alice@example.com",globalRole:"USER",zones:2,lastLoginAt:"2h ago",createdAt:"Aug 18, 2026"},
  {id:"bob",name:"Bob Chen",email:"bob@example.com",globalRole:"USER",zones:1,lastLoginAt:"Yesterday",createdAt:"Aug 22, 2026"},
];
