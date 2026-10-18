import { requireActor } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui";
import { UnitsWorkbench } from "@/components/units/units-workbench";
import { CurrentInspectionEvent } from "@/components/inspection-events/current-event";

export const metadata = { title: "單位 DNS" };
export default async function UnitDnsPage() {
  await requireActor();
  return <div className="content"><PageHeader title="單位 DNS" /><CurrentInspectionEvent /><UnitsWorkbench systemAdmin={false} mode="dns" /></div>;
}
