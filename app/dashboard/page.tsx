import { redirect } from "next/navigation";
import { AuthError, requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";

export default async function DashboardRedirect() {
  const actor = await requireActor().catch((error: unknown) => {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  });
  redirect(canAccessZoneManagement(actor) ? "/requests" : "/dns");
}
