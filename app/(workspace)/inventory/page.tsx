import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/ui";
import { InventoryWorkbench } from "@/components/admin/inventory-workbench";
export const metadata = { title: "DNS 定期清查" };
export default async function InventoryPage() { const actor = await requireActor(); if (!canAccessZoneManagement(actor)) redirect("/requests"); return <div className="content"><PageHeader title="DNS 定期清查" description="依歸屬整理現有 DNS，保留每次清查日期、經手人與備註。" /><InventoryWorkbench /></div>; }
