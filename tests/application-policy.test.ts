import { expect, it } from "vitest";
import { applicationPolicySchema, defaultApplicationPolicy, policyViolation } from "@/lib/requests/policy-model";
it("rejects unconfigured record types and duplicate policy entries", () => {
 expect(policyViolation({ ...defaultApplicationPolicy, allowedTypes: ["A"] }, ["AAAA"], undefined, false)).toBeTruthy();
 expect(policyViolation({ ...defaultApplicationPolicy, allowedTypes: [] }, ["A"], undefined, true)).toBeTruthy();
 expect(applicationPolicySchema.safeParse({ allowedTypes: ["A", "A"], ownership: "ANY" }).success).toBe(false);
 expect(applicationPolicySchema.safeParse({ allowedTypes: ["SOA"], ownership: "ANY" }).success).toBe(false);
});
it("requires unit ownership and membership unconditionally", () => {
 expect(policyViolation(defaultApplicationPolicy, ["A"], undefined, false)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], undefined, true)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], "unit", false)).toBeTruthy();
 expect(policyViolation(defaultApplicationPolicy, ["A"], "unit", true)).toBeNull();
 for (const ownership of ["ANY", "MEMBERS_ONLY"]) expect(applicationPolicySchema.safeParse({ allowedTypes: ["A"], ownership }).success).toBe(false);
});
