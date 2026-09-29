import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/owner";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { DeletionProtectionSettings } from "@/components/admin/deletion-protection";
export const metadata = { title: "刪除保護" };
export default async function Page() {
  const actor = await requireActor();
  if (!canAccessZoneManagement(actor)) redirect("/requests");
  return <div className="content"><PageHeader title="刪除保護" description="刪除 DNS 前必須再次輸入由最高管理員設定的專用密碼。" /><DeletionProtectionSettings canConfigure={isOwner(actor)} /></div>;
}
