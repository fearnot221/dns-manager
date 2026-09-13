import { OWNER_IDENTIFIER, resolvedGlobalRole } from "@/lib/auth/owner";
import type { GlobalRole } from "@/lib/dns/types";

export function accountPresentation(user: { id: string; email: string; globalRole: GlobalRole; studentId?: string | null; note?: string; portalIdentifier?: string | null; disabled?: boolean; zoneAdmin?: boolean; accounts?: { providerAccountId: string }[] }) {
  const portalIdentifier = user.accounts?.[0]?.providerAccountId ?? user.portalIdentifier ?? null;
  return { id: user.id, account: user.studentId || portalIdentifier || `未綁定 Portal (${user.id})`, note: user.note || "", portalIdentifier, globalRole: resolvedGlobalRole(user.email, user.globalRole, portalIdentifier), disabled: !!user.disabled, zoneAdmin: !!user.zoneAdmin, protected: portalIdentifier === OWNER_IDENTIFIER };
}
