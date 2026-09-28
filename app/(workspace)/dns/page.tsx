import { redirect } from "next/navigation";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { UnitsWorkbench } from "@/components/units/units-workbench";

export const metadata = { title: "單位 DNS" };
export default async function UnitDnsPage() {
  const actor = await requireActor();
  if (isGlobalAdmin(actor)) redirect("/units");
  return <div className="content"><PageHeader title="單位 DNS" description="查看單位目前生效的 DNS 紀錄；新增或變更需送交審核。" /><UnitsWorkbench systemAdmin={false} mode="dns" /></div>;
}
