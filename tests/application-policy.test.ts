import { expect, it } from "vitest";
import { applicationPolicySchema, defaultApplicationPolicy, policyViolation } from "@/lib/requests/policy-model";
it("rejects unconfigured record types and duplicate policy entries", () => {
 expect(policyViolation({ ...defaultApplicationPolicy, allowedTypes: ["A"] }, ["AAAA"], undefined, false)).toBeTruthy();
 expect(policyViolation({ ...defaultApplicationPolicy, allowedTypes: [] }, ["A"], undefined, true)).toBeTruthy();
 expect(applicationPolicySchema.safeParse({ allowedTypes: ["A", "A"], ownership: "ANY" }).success).toBe(false);
 expect(applicationPolicySchema.safeParse({ allowedTypes: ["SOA"], ownership: "ANY" }).success).toBe(false);
});
it("distinguishes membership eligibility from mandatory unit ownership", () => {
 expect(policyViolation(defaultApplicationPolicy, ["A"], undefined, false)).toBeNull();
 expect(policyViolation({ ...defaultApplicationPolicy, ownership: "MEMBERS_ONLY" }, ["A"], undefined, false)).toBeTruthy();
 expect(policyViolation({ ...defaultApplicationPolicy, ownership: "MEMBERS_ONLY" }, ["A"], undefined, true)).toBeNull();
 expect(policyViolation({ ...defaultApplicationPolicy, ownership: "UNIT_ONLY" }, ["A"], undefined, true)).toBeTruthy();
 expect(policyViolation({ ...defaultApplicationPolicy, ownership: "UNIT_ONLY" }, ["A"], "unit", true)).toBeNull();
});
