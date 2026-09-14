import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { InspectionsWorkbench } from "@/components/workflows/inspections";
export default async function Page() { const actor = await requireActor(); return <div className="content"><PageHeader title={isGlobalAdmin(actor) ? "清查回覆管理" : "我的清查通知"} description={isGlobalAdmin(actor) ? "追蹤全站清查回覆、查看問題或撤回待確認通知；只有被指派者能回覆通知。" : "僅顯示指派給你的清查通知；確認是否仍在使用，回覆不會直接修改 DNS。"} /><InspectionsWorkbench admin={isGlobalAdmin(actor)} actorId={actor.id} /></div>; }
