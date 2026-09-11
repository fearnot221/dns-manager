import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { PowerDNSSettings } from "@/components/admin/powerdns-settings";
export const metadata = { title: "PowerDNS API" };
export default async function PowerDNSPage() { if (!isGlobalAdmin(await requireActor())) redirect("/requests"); return <div className="content application-content"><PageHeader title="PowerDNS API" description="由後端連線至 PowerDNS，API 金鑰不會交給一般使用者。" /><PowerDNSSettings /></div>; }
