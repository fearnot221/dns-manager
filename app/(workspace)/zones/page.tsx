import { PageHeader } from "@/components/ui";
import { ZonesTable } from "@/components/zones/zones-table";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Zone 管理" };

export default async function ZonesPage() {
  const actor = await requireActor();
  if (!canAccessZoneManagement(actor)) redirect("/requests");

  return (
    <div className="content">
      <PageHeader title="Zone 管理" description="查看與管理授權範圍內的網域。" />
      <ZonesTable />
    </div>
  );
}
