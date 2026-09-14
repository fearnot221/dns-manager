import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { ContactWorkbench } from "@/components/workflows/contact";
export default async function Page() { const actor = await requireActor(); return <div className="content"><PageHeader title="聯絡管理員" description="在站內提出問題並查看管理員回覆。" /><ContactWorkbench admin={isGlobalAdmin(actor)} /></div>; }
