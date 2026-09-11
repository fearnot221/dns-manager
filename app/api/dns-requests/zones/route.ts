import { requireActor } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { normalizeZoneName } from "@/lib/dns/names";
import { apiError } from "@/lib/api/respond";

/** Application choices only: never expose records, permissions or PowerDNS credentials. */
export async function GET() {
  try {
    await requireActor();
    const source = await powerdns.listZones();
    const zones = [...new Set(source.map((zone) => normalizeZoneName(zone.name)))].sort().map((name) => ({ name }));
    return Response.json({ zones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
