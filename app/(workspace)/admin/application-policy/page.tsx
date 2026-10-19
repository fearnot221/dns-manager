import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { ApplicationPolicySettings } from "@/components/admin/application-policy";
export const metadata = { title: "申請規則" };
export default async function Page() { const actor = await requireActor(); if (!isGlobalAdmin(actor)) redirect("/requests"); return <div className="content"><PageHeader title="申請規則" /><ApplicationPolicySettings /></div>; }
