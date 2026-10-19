import { z } from "zod";
import { zoneCategory } from "@/lib/dns/zone-category";
export const applicationTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"] as const;
export type ApplicationType = typeof applicationTypes[number];
export const applicationPolicySchema = z.object({ adminOnlyTypes: z.array(z.enum(applicationTypes)).max(applicationTypes.length).refine((types) => new Set(types).size === types.length, "Type 不可重複"), ownership: z.literal("UNIT_ONLY") }).strict();
export type ApplicationPolicy = z.infer<typeof applicationPolicySchema> & { updatedAt: string | null };
export const defaultApplicationPolicy: ApplicationPolicy = { adminOnlyTypes: [], ownership: "UNIT_ONLY", updatedAt: null };
export const availableTypes = (policy: Pick<ApplicationPolicy, "adminOnlyTypes">, admin: boolean) => applicationTypes.filter((type) => admin || !policy.adminOnlyTypes.includes(type));
/** PTR lives only in reverse zones; every other type only in forward zones. */
export const zoneAcceptsType = (zoneName: string, type: string) => (type === "PTR") === (zoneCategory(zoneName) !== "forward");
export function policyViolation(policy: ApplicationPolicy, types: string[], unitId: string | undefined, member: boolean, admin = false) {
  if (types.some((type) => !(availableTypes(policy, admin) as string[]).includes(type))) return "此申請含僅限系統管理員申請的 DNS Type，請重新載入表單。";
  if (!unitId) return "目前僅接受單位共享 DNS，請加入單位並選擇單位歸屬。";
  if (!member) return "目前僅限已加入單位的使用者申請 DNS。";
  return null;
}
