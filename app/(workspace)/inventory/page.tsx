import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";
export default async function InventoryPage() {
  const actor = await requireActor();
  if (!canAccessZoneManagement(actor)) redirect("/requests");
  redirect("/zones");
}
