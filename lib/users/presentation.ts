import { accountOwnerIdentifier, OWNER_IDENTIFIER, resolvedGlobalRole } from "@/lib/auth/owner";
import type { GlobalRole } from "@/lib/dns/types";
import { personDisplay } from "./display";

export function accountPresentation(user: { id: string; name?: string | null; logtoName?: string | null; email: string; portalEmail?: string | null; globalRole: GlobalRole; studentId?: string | null; note?: string; portalIdentifier?: string | null; disabled?: boolean; zoneAdmin?: boolean; accounts?: { provider?: string; providerAccountId: string }[] }) {
  const portalIdentifier = accountOwnerIdentifier(user.accounts, user.globalRole, user.logtoName) ?? user.portalIdentifier ?? null;
  const email = user.portalEmail || (user.email.toLowerCase().endsWith("@accounts.invalid") ? null : user.email);
  return { id: user.id, name: personDisplay({ name: user.name, email, studentId: user.studentId || user.logtoName }).primary, email, studentId: user.studentId || user.logtoName, account: user.studentId || user.logtoName || portalIdentifier || email || `未綁定 Portal (${user.id})`, note: user.note || "", portalIdentifier, globalRole: resolvedGlobalRole(user.email, user.globalRole, portalIdentifier), disabled: !!user.disabled, zoneAdmin: !!user.zoneAdmin, protected: portalIdentifier === OWNER_IDENTIFIER };
}
