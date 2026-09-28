import { z } from "zod";
import { requireActor } from "@/lib/auth/session";
import { apiError } from "@/lib/api/respond";
import { listDnsChanges } from "@/lib/dns-changes/service";
export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    const page = z.coerce.number().int().min(1).max(10000).parse(new URL(request.url).searchParams.get("page") ?? 1);
    return Response.json(await listDnsChanges(actor, page), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
