import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { AuditWorkbench } from "@/components/admin/audit-workbench";
export const metadata = { title: "操作紀錄" };
export default async function ActivityPage() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="操作紀錄" description="追蹤操作者、變更內容與執行結果。紀錄僅供查閱，無法由後台修改或刪除。" /><AuditWorkbench /></div>;
}
