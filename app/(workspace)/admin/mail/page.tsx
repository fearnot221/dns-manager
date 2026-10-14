import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { MailSettings } from "@/components/admin/mail-settings";
export const metadata = { title: "郵件服務" };
export default async function Page() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="郵件服務" description="設定 Google SMTP 與 DNS 申請通知，管理收件小組、郵件模板及寄送結果。" /><MailSettings /></div>;
}
