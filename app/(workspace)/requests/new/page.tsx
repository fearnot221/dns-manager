import { DnsApplicationForm } from "@/components/requests/dns-application-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";

export const metadata = { title: "申請 DNS" };

export default async function NewDnsRequestPage() {
  await requireActor();

  return <div className="content application-content">
    <PageHeader title="申請 DNS" description="填寫聯絡資料與紀錄，完成後一併送交審核。" />
    <DnsApplicationForm />
  </div>;
}
