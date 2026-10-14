import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { MailSettings } from "@/components/admin/mail-settings";
export const metadata = { title: "郵件服務" };
export default async function Page() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="郵件服務" /><MailSettings /></div>;
}
