import { contentSecurityPolicy } from "@/lib/security/csp";
import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { applicationOrigin, isSameOrigin } from "@/lib/api/origin";
import { loginProviderAllowed } from "@/lib/auth/policy";

export async function proxy(request:NextRequest){
  const nonce=Buffer.from(crypto.randomUUID()).toString("base64");
  const csp=contentSecurityPolicy(nonce,process.env.NODE_ENV==="development");
  const requestHeaders=new Headers(request.headers);
  requestHeaders.set("x-nonce",nonce);
  requestHeaders.set("Content-Security-Policy",csp);
  const next=()=>NextResponse.next({request:{headers:requestHeaders}});
  const finish=(response:Response)=>{
    response.headers.set("Content-Security-Policy",csp);
    if (request.nextUrl.pathname.startsWith("/api/") || !request.nextUrl.pathname.startsWith("/_next/")) response.headers.set("Cache-Control","private, no-store");
    return response;
  };
  const path=request.nextUrl.pathname;
  if(path.startsWith("/api/auth/"))return finish(next());
  if(["POST","PUT","PATCH","DELETE"].includes(request.method)){
    if(!isSameOrigin(request))return finish(Response.json({error:"Cross-origin request rejected"},{status:403}));
  }
  const protectedPath=path.startsWith("/api/") || /^\/(contact|inspections|dashboard|dns|requests|units|zones|activity|admin|inventory)(?:\/|$)/.test(path);
  if (!protectedPath) return finish(next());
  const token=await getToken({req:request,secret:process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET,secureCookie:applicationOrigin(request).startsWith("https:")});
  if(!token || !loginProviderAllowed(token.loginProvider)){
    if(path.startsWith("/api/"))return finish(Response.json({error:"Authentication required"},{status:401}));
    const url=new URL("/login",applicationOrigin(request));url.searchParams.set("callbackUrl",path);return finish(NextResponse.redirect(url));
  }
  return finish(next());
}
// Match documents (including login, errors and /dns) and APIs; static assets stay public.
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico|ncu-emblem.png).*)"]};
