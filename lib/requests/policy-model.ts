import { z } from "zod";
export const applicationTypes = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"] as const;
export const applicationPolicySchema = z.object({ allowedTypes: z.array(z.enum(applicationTypes)).max(applicationTypes.length).refine((types) => new Set(types).size === types.length, "Type 不可重複"), ownership: z.enum(["ANY", "MEMBERS_ONLY", "UNIT_ONLY"]) }).strict();
export type ApplicationPolicy = z.infer<typeof applicationPolicySchema> & { updatedAt: string | null };
export const defaultApplicationPolicy: ApplicationPolicy = { allowedTypes: [...applicationTypes], ownership: "ANY", updatedAt: null };
export function policyViolation(policy: ApplicationPolicy, types: string[], unitId: string | undefined, member: boolean) {
  if (types.some((type) => !policy.allowedTypes.includes(type as typeof applicationTypes[number]))) return "此申請含目前未開放的 DNS Type，請重新載入表單。";
  if (policy.ownership === "UNIT_ONLY" && !unitId) return "目前僅接受單位共享 DNS，請加入單位並選擇單位歸屬。";
  if (policy.ownership !== "ANY" && !member) return "目前僅限已加入單位的使用者申請 DNS。";
  return null;
}
