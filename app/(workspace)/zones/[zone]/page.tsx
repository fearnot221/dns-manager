import { canManageZone } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import { normalizeZoneName } from "@/lib/dns/names";
import { notFound, redirect } from "next/navigation";

export default async function ZonePage({ params }: PageProps<"/zones/[zone]">) {
  const actor = await requireActor();
  const { zone } = await params;
  const zoneName = normalizeZoneName(zone);
  if (!canManageZone(actor, zoneName)) notFound();

  redirect(`/zones?domain=${encodeURIComponent(zoneName)}`);
}
