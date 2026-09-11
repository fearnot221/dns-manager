import { redirect } from "next/navigation";
import { isGlobalAdmin } from "@/lib/auth/owner";
import { AppShell } from "@/components/app-shell";
import { AuthError, requireActor } from "@/lib/auth/session";
import { canAccessZoneManagement } from "@/lib/auth/permissions";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor().catch((error: unknown) => {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  });
  return <AppShell systemAdmin={isGlobalAdmin(actor)} admin={canAccessZoneManagement(actor)} demo={process.env.NODE_ENV !== "production" && process.env.PDNS_MOCK === "true"}
    identity={{ name: actor.name || actor.email, email: actor.email }}>
    {children}
  </AppShell>;
}
