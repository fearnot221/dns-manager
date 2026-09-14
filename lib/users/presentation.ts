import { accountOwnerIdentifier, OWNER_IDENTIFIER, resolvedGlobalRole } from "@/lib/auth/owner";
import type { GlobalRole } from "@/lib/dns/types";

export function accountPresentation(user: { id: string; name?: string | null; email: string; portalEmail?: string | null; globalRole: GlobalRole; studentId?: string | null; note?: string; portalIdentifier?: string | null; disabled?: boolean; zoneAdmin?: boolean; accounts?: { provider?: string; providerAccountId: string }[] }) {
  const portalIdentifier = accountOwnerIdentifier(user.accounts, user.globalRole) ?? user.portalIdentifier ?? null;
  const email = user.portalEmail || (user.email.toLowerCase().endsWith("@accounts.invalid") ? null : user.email);
  return { id: user.id, name: user.name || email || user.studentId || portalIdentifier || "未提供姓名", email, account: portalIdentifier || email || `未綁定 Portal (${user.id})`, note: user.note || "", portalIdentifier, globalRole: resolvedGlobalRole(user.email, user.globalRole, portalIdentifier), disabled: !!user.disabled, zoneAdmin: !!user.zoneAdmin, protected: portalIdentifier === OWNER_IDENTIFIER };
}
