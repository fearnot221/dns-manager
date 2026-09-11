import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { UsersWorkbench } from "@/components/admin/users-workbench";
export const metadata = { title: "使用者管理" };
export default async function UsersPage() { if (!isGlobalAdmin(await requireActor())) redirect("/requests"); return <div className="content"><PageHeader title="使用者管理" description="管理帳號狀態與角色，保留每位使用者的操作紀錄。" /><UsersWorkbench /></div>; }
