import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { InspectionEvents } from "@/components/admin/inspection-events";

export const metadata = { title: "清查活動" };

export default async function InspectionEventsPage() {
  if (!isGlobalAdmin(await requireActor())) redirect("/dns");
  return <div className="content"><PageHeader title="清查活動" description="排定 DNS 清查期間；期間內留下的清查紀錄會標記所屬活動。" /><InspectionEvents /></div>;
}
