import { ZodError } from "zod";
import { AuthError } from "@/lib/auth/session";
import { PowerDNSError } from "@/lib/powerdns/errors";

export function apiError(error:unknown):Response {
  const requestId=crypto.randomUUID();
  if(error instanceof ZodError)return Response.json({error:"送出的資料格式不正確，請檢查欄位後重試。",fields:error.flatten().fieldErrors,requestId},{status:400});
  if(error instanceof AuthError)return Response.json({error:error.message,requestId},{status:401});
  if(error instanceof PowerDNSError)return Response.json({error:error.message,requestId},{status:error.status});
  if(error instanceof ApiError)return Response.json({error:error.message,requestId},{status:error.status});
  console.error(JSON.stringify({level:"error",requestId,message:error instanceof Error?error.message:"Unknown error"}));
  return Response.json({error:`系統暫時無法完成這個操作，請稍後重試。若持續發生，請將請求編號 ${requestId} 提供給管理員。`,requestId},{status:500});
}
export class ApiError extends Error { constructor(message:string,public readonly status:number){super(message);} }
export function notFoundUnless(allowed:boolean):void { if(!allowed)throw new ApiError("Resource not found",404); }
