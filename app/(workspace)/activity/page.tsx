import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { AuditWorkbench } from "@/components/admin/audit-workbench";
export const metadata = { title: "操作紀錄" };
export default async function ActivityPage() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="操作紀錄" /><AuditWorkbench /></div>;
}
