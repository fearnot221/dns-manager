import { memberWorkspaces } from "@/lib/units/workspace";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { UnitsWorkbench } from "@/components/units/units-workbench";
import { isGlobalAdmin } from "@/lib/auth/owner";
export const metadata = { title: "單位管理" };
export default async function UnitsPage() {
  const actor = await requireActor();
  if (!isGlobalAdmin(actor) && !(await memberWorkspaces(actor)).some((unit) => unit.role === "ADMIN")) redirect("/dns");
  return <div className="content"><PageHeader title="單位管理" description="新增或移除單位使用者，並管理使用權限。" /><UnitsWorkbench systemAdmin={isGlobalAdmin(actor)} /></div>;
}
