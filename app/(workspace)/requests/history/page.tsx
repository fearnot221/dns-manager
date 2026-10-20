import { DnsRequestsWorkbench } from "@/components/requests/dns-requests-workbench";
import { PageHeader } from "@/components/ui";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";

export const metadata = { title: "申請紀錄" };

export default async function RequestHistoryPage() {
  const actor = await requireActor();
  return <div className="content"><PageHeader title="申請紀錄" /><DnsRequestsWorkbench admin={canAccessZoneManagement(actor)} actorId={actor.id} personal /></div>;
}
