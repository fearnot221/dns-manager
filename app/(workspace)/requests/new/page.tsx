import { redirect } from "next/navigation";
import { DnsApplicationForm } from "@/components/requests/dns-application-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";

export const metadata = { title: "申請 DNS" };

export default async function NewDnsRequestPage() {
  const actor = await requireActor();
  if (canAccessZoneManagement(actor)) redirect("/requests");

  return <div className="content application-content">
    <PageHeader title="申請 DNS" description="填寫聯絡資料與紀錄，完成後一併送交審核。" />
    <DnsApplicationForm />
  </div>;
}
