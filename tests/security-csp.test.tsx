import { renderToStaticMarkup } from "react-dom/server";
import { Providers } from "@/components/providers";
import { afterEach, expect,it,vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("next-auth/jwt",()=>({getToken:vi.fn(async()=>null)}));
import { proxy } from "@/proxy";
import { contentSecurityPolicy } from "@/lib/security/csp";
import { recordMatchesPattern,canManageRecord,canEditRecordType } from "@/lib/auth/permissions";
import type { Actor } from "@/lib/dns/types";
afterEach(()=>vi.unstubAllEnvs());
it("replaces spoofed nonces, applies a unique strict CSP to login and /dns, and forbids sensitive caching",async()=>{
 vi.stubEnv("NODE_ENV","production");vi.stubEnv("AUTH_URL","https://dns.example.test");
 const first=await proxy(new NextRequest("https://dns.example.test/login",{headers:{"x-nonce":"attacker"}}));
 const second=await proxy(new NextRequest("https://dns.example.test/login"));
 const csp=first.headers.get("Content-Security-Policy")!;
 expect(csp).toContain("'nonce-");expect(csp.match(/script-src[^;]+/)![0]).not.toMatch(/unsafe-inline|unsafe-eval|attacker/);
 expect(first.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
 expect(second.headers.get("Content-Security-Policy")).not.toBe(csp);
 expect(first.headers.get("Cache-Control")).toBe("private, no-store");
 const protectedResponse=await proxy(new NextRequest("https://dns.example.test/dns"));expect(protectedResponse.status).toBe(307);expect(protectedResponse.headers.get("Content-Security-Policy")).toBeTruthy();
 expect(contentSecurityPolicy("test",true)).toContain("unsafe-eval");
});
it("enforces DNS-label boundaries, exact names, types and unions without widening grants",()=>{
 const actor:Actor={id:"u",email:"u@test.invalid",globalRole:"USER",zoneRoles:{"example.test.":"ADMIN"},zoneGrants:[{zoneName:"example.test.",role:"ADMIN",resourcePattern:"*.lab.example.test.",allowedRecordTypes:["A"]},{zoneName:"example.test.",role:"ADMIN",resourcePattern:"mail.example.test.",allowedRecordTypes:["MX"]}]};
 expect(canManageRecord(actor,"example.test.","in.lab.example.test.","A")).toBe(true);
 expect(canManageRecord(actor,"example.test.","mail.example.test.","MX")).toBe(true);
 for(const name of ["lab.example.test.","notlab.example.test.","outside.example.test.","x.lab.example.test.evil."])expect(canManageRecord(actor,"example.test.",name,"A")).toBe(false);
 expect(canEditRecordType(actor,"example.test.","TXT","in.lab.example.test.")).toBe(false);
 expect(recordMatchesPattern("x.lab.example.test.","example.test.","*.other.test.")).toBe(false);
});

it("passes the server nonce to the existing theme initialization script",()=>{
 const html=renderToStaticMarkup(<Providers nonce="theme-nonce">fixture</Providers>);
 expect(html).toContain('nonce="theme-nonce"');expect(html).toContain('aegis-theme');
});
