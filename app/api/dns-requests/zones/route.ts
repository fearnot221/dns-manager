import { requireActor } from "@/lib/auth/session";
import { powerdns } from "@/lib/powerdns/client";
import { applicationZoneNames } from "@/lib/requests/zone-access";
import { apiError } from "@/lib/api/respond";

/** Application choices only: never expose records, permissions or PowerDNS credentials. */
export async function GET() {
  try {
    await requireActor();
    const source = await powerdns.listZones();
    const zones = (await applicationZoneNames(source.map((zone) => zone.name))).map((name) => ({ name }));
    return Response.json({ zones }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
