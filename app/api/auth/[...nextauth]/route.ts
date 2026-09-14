import { handlers } from "@/lib/auth/config";
import type { NextRequest } from "next/server";
import { measurePortalCallback } from "@/lib/auth/timing";

function timed(handler: (request: NextRequest) => Promise<Response>) {
  return (request: NextRequest) => request.nextUrl.pathname === "/api/auth/callback/logto"
    ? measurePortalCallback(() => handler(request)) : handler(request);
}
export const GET = timed(handlers.GET);
export const POST = timed(handlers.POST);
