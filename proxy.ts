import { getToken } from "next-auth/jwt";
import { NextResponse, type NextRequest } from "next/server";
import { applicationOrigin, isSameOrigin } from "@/lib/api/origin";

export async function proxy(request:NextRequest){
  if(request.nextUrl.pathname.startsWith("/api/auth/"))return NextResponse.next();
  if(["POST","PUT","PATCH","DELETE"].includes(request.method)){
    if(!isSameOrigin(request))return Response.json({error:"Cross-origin request rejected"},{status:403});
  }
  const token=await getToken({req:request,secret:process.env.AUTH_SECRET??process.env.NEXTAUTH_SECRET,secureCookie:applicationOrigin(request).startsWith("https:")});
  if(!token){if(request.nextUrl.pathname.startsWith("/api/"))return Response.json({error:"Authentication required"},{status:401});const url=new URL("/login",applicationOrigin(request));url.searchParams.set("callbackUrl",request.nextUrl.pathname);return NextResponse.redirect(url);}
  return NextResponse.next();
}
export const config={matcher:["/dashboard/:path*","/requests/:path*","/zones/:path*","/activity/:path*","/admin/:path*","/inventory/:path*","/api/:path*"]};
