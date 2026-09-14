import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { InspectionsWorkbench } from "@/components/workflows/inspections";
export default async function Page() { const actor = await requireActor(); return <div className="content"><PageHeader title="清查通知" description="確認 DNS 是否仍在使用；回覆會留下日期與經手人，不會直接修改 DNS。" /><InspectionsWorkbench admin={isGlobalAdmin(actor)} actorId={actor.id} /></div>; }
