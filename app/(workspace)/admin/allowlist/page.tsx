import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { PageHeader } from "@/components/ui";
import { PortalAllowlist } from "@/components/admin/portal-allowlist";

export const metadata = { title: "登入白名單" };
export default async function AllowlistPage() {
  if (!isGlobalAdmin(await requireActor())) redirect("/requests");
  return <div className="content"><PageHeader title="登入白名單" description="管理可透過 NCU Portal 登入的電子郵件。加入白名單不會授予管理員權限。" /><PortalAllowlist /></div>;
}
