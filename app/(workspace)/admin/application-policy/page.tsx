import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { ApplicationPolicySettings } from "@/components/admin/application-policy";
export default async function Page() { const actor = await requireActor(); if (!isGlobalAdmin(actor)) redirect("/requests"); return <div className="content"><PageHeader title="申請設定" description="設定開放申請的紀錄類型、申請資格及 DNS 歸屬限制。" /><ApplicationPolicySettings /></div>; }
