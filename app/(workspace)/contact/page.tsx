import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { ContactWorkbench } from "@/components/workflows/contact";
export default async function Page() { const actor = await requireActor(); return <div className="content"><PageHeader title={isGlobalAdmin(actor) ? "使用者訊息" : "聯絡管理員"} description={isGlobalAdmin(actor) ? "查看使用者提出的問題並回覆；訊息僅在站內傳遞。" : "在站內提出問題並查看管理員回覆。"} /><ContactWorkbench admin={isGlobalAdmin(actor)} /></div>; }
