import { DnsRequestsWorkbench } from "@/components/requests/dns-requests-workbench";
import { PageHeader } from "@/components/ui";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { requireActor } from "@/lib/auth/session";
import Link from "next/link";
import { Plus } from "lucide-react";

export const metadata = { title: "DNS" };

export default async function RequestsPage() {
  const actor = await requireActor();
  const admin = canAccessZoneManagement(actor);
  return (
    <div className="content">
      <PageHeader title={admin ? "DNS 申請審核" : "我的 DNS"} description={admin ? "確認申請內容後，逐筆核准或退回。" : "你的 DNS 紀錄與申請進度。"} actions={!admin && <Link className="button primary" href="/requests/new"><Plus size={16} />申請 DNS</Link>} />
      <DnsRequestsWorkbench admin={admin} />
    </div>
  );
}
