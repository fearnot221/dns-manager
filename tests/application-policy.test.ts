import { expect, it } from "vitest";
import { applicationPolicySchema, availableTypes, defaultApplicationPolicy, policyViolation } from "@/lib/requests/policy-model";
it("limits admin-only and unknown record types and duplicate policy entries", () => {
 const policy = { ...defaultApplicationPolicy, adminOnlyTypes: ["PTR" as const] };
 expect(policyViolation(policy, ["PTR"], "unit", true)).toBeTruthy();
 expect(policyViolation(policy, ["PTR"], "unit", true, true)).toBeNull();
 expect(policyViolation(policy, ["SOA"], "unit", true, true)).toBeTruthy();
 expect(availableTypes(policy, false)).not.toContain("PTR");
 expect(availableTypes(policy, true)).toContain("PTR");
 expect(applicationPolicySchema.safeParse({ adminOnlyTypes: ["A", "A"], ownership: "UNIT_ONLY" }).success).toBe(false);
 expect(applicationPolicySchema.safeParse({ adminOnlyTypes: ["SOA"], ownership: "UNIT_ONLY" }).success).toBe(false);
 expect(applicationPolicySchema.safeParse({ allowedTypes: ["A"], ownership: "UNIT_ONLY" }).success).toBe(false);
});
it("requires unit ownership and membership unconditionally", () => {
 expect(policyViolation(defaultApplicationPolicy, ["A"], undefined, false)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], undefined, true)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], "unit", false)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], "unit", true)).toBeNull();
 for (const ownership of ["ANY", "MEMBERS_ONLY"]) expect(applicationPolicySchema.safeParse({ adminOnlyTypes: ["A"], ownership }).success).toBe(false);
});
