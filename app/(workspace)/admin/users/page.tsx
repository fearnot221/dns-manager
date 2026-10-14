import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { UsersWorkbench } from "@/components/admin/users-workbench";
export const metadata = { title: "帳號管理" };
export default async function UsersPage() { if (!isGlobalAdmin(await requireActor())) redirect("/requests"); return <div className="content"><PageHeader title="帳號管理" /><UsersWorkbench /></div>; }
