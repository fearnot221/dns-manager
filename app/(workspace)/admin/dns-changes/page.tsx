import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { DnsChangesWorkbench } from "@/components/admin/dns-changes-workbench";
export const metadata = { title: "DNS 變更紀錄" };
export default async function DnsChangesPage() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="DNS 變更紀錄" description="查看透過系統完成的 DNS 新增、修改與刪除，並復原可還原的變更。" /><DnsChangesWorkbench /></div>;
}
