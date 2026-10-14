import { DnsRequestsWorkbench } from "@/components/requests/dns-requests-workbench";
import { PageHeader } from "@/components/ui";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";

export async function generateMetadata() {
  return { title: canAccessZoneManagement(await requireActor()) ? "申請審核" : "申請紀錄" };
}

export default async function RequestsPage() {
  const actor = await requireActor();
  const admin = canAccessZoneManagement(actor);
  return (
    <div className="content">
      <PageHeader title={admin ? "申請審核" : "申請紀錄"} />
      <DnsRequestsWorkbench admin={admin} actorId={actor.id} />
    </div>
  );
}
