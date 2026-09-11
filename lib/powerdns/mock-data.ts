import type { Zone } from "@/lib/dns/types";

export const MOCK_ZONES:Zone[] = [
  { id:"example.com.",name:"example.com.",kind:"Native",serial:2026090901,dnssec:true,rrsets:[
    {name:"example.com.",type:"SOA",ttl:3600,records:[{content:"ns1.example.com. hostmaster.example.com. 2026090901 10800 3600 604800 3600",disabled:false}]},
    {name:"example.com.",type:"NS",ttl:3600,records:[{content:"ns1.example.com.",disabled:false},{content:"ns2.example.com.",disabled:false}]},
    {name:"example.com.",type:"A",ttl:300,records:[{content:"140.115.154.20",disabled:false}]},
    {name:"www.example.com.",type:"A",ttl:300,records:[{content:"1.1.1.1",disabled:false},{content:"1.0.0.1",disabled:false}]},
    {name:"api.example.com.",type:"AAAA",ttl:300,records:[{content:"2001:db8::10",disabled:false}]},
    {name:"app.example.com.",type:"CNAME",ttl:600,records:[{content:"edge.example.net.",disabled:false}]},
    {name:"example.com.",type:"MX",ttl:3600,records:[{content:"10 mail.example.com.",disabled:false}]},
    {name:"example.com.",type:"TXT",ttl:3600,records:[{content:"\"v=spf1 include:_spf.google.com ~all\"",disabled:false}]},
    {name:"_sip._tcp.example.com.",type:"SRV",ttl:600,records:[{content:"10 5 5060 sip.example.com.",disabled:false}]},
    {name:"example.com.",type:"CAA",ttl:3600,records:[{content:"0 issue \"letsencrypt.org\"",disabled:false}]},
  ]},
  { id:"internal.example.com.",name:"internal.example.com.",kind:"Native",serial:2026090804,dnssec:false,rrsets:[{name:"gateway.internal.example.com.",type:"A",ttl:60,records:[{content:"10.10.0.1",disabled:false}]}]},
  { id:"student.example.com.",name:"student.example.com.",kind:"Native",serial:2026090702,dnssec:true,rrsets:[{name:"minecraft.student.example.com.",type:"A",ttl:300,records:[{content:"203.0.113.42",disabled:false}]}]},
];
