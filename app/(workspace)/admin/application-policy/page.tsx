import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { ApplicationPolicySettings } from "@/components/admin/application-policy";
export const metadata = { title: "申請規則" };
export default async function Page() { const actor = await requireActor(); if (!canAccessZoneManagement(actor)) redirect("/requests"); return <div className="content"><PageHeader title="申請規則" description="設定開放申請的網域與 DNS 類型；申請須具備單位編輯權限。" /><ApplicationPolicySettings systemAdmin={isGlobalAdmin(actor)} /></div>; }
