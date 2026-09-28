import { PageHeader } from "@/components/ui";
import { DnsManagementWorkbench } from "@/components/admin/dns-management-workbench";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { isGlobalAdmin, isOwner } from "@/lib/auth/owner";
import { DnsExportButton } from "@/components/admin/dns-export-button";

export const metadata = { title: "DNS 管理" };

export default async function ZonesPage({ searchParams }: PageProps<"/zones">) {
  const actor = await requireActor();
  if (!canAccessZoneManagement(actor)) redirect("/requests");

  const params = await searchParams;
  const initialDomain = typeof params.domain === "string" ? params.domain : "";
  return (
    <div className="content">
      <PageHeader title="DNS 管理" description="依網域管理 DNS 紀錄、清查使用情形與維護所屬單位。" actions={isGlobalAdmin(actor) && <DnsExportButton />} />
      <DnsManagementWorkbench key={initialDomain} initialDomain={initialDomain} systemAdmin={isGlobalAdmin(actor)} canDeleteInspections={isOwner(actor)} />
    </div>
  );
}
