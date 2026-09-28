import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { UnitsWorkbench } from "@/components/units/units-workbench";
import { isGlobalAdmin } from "@/lib/auth/owner";
export const metadata = { title: "單位與共享 DNS" };
export default async function UnitsPage() {
  const actor = await requireActor();
  return <div className="content"><PageHeader title="單位與共享 DNS" description="與同單位成員查看 DNS、提出變更並管理成員權限。" /><UnitsWorkbench systemAdmin={isGlobalAdmin(actor)} /></div>;
}
