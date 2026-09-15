import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { ApplicationPolicySettings } from "@/components/admin/application-policy";
export default async function Page() { const actor = await requireActor(); if (!canAccessZoneManagement(actor)) redirect("/requests"); return <div className="content"><PageHeader title="申請設定" description="集中管理開放申請的網域、紀錄類型、申請資格及 DNS 歸屬限制。" /><ApplicationPolicySettings systemAdmin={isGlobalAdmin(actor)} /></div>; }
