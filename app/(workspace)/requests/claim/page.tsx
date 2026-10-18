import { DnsApplicationForm } from "@/components/requests/dns-application-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";

export const metadata = { title: "DNS 歸屬申請" };
export default async function ClaimDnsPage() {
  await requireActor();
  return <div className="content application-content"><PageHeader title="DNS 歸屬申請" /><DnsApplicationForm operation="CLAIM" /></div>;
}
