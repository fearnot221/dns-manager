import { redirect } from "next/navigation";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { DnsApplicationForm } from "@/components/requests/dns-application-form";
import { PageHeader } from "@/components/ui";
import { requireActor } from "@/lib/auth/session";

export const metadata = { title: "申請 DNS" };

export default async function NewDnsRequestPage() {
  const actor = await requireActor();
  if (isGlobalAdmin(actor)) redirect("/requests");

  return <div className="content application-content">
    <PageHeader title="申請 DNS" />
    <DnsApplicationForm />
  </div>;
}
