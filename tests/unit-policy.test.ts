import { describe, expect, it } from "vitest";
import { canSubmitUnitRequest, wouldRemoveLastAdmin } from "@/lib/units/policy";
import { newPasscode, passcodeHash } from "@/lib/units/passcode";
import { replaceUnitValue, unitChangeState } from "@/lib/units/change";
import { redactAudit } from "@/lib/audit/redact";
import type { RRSet } from "@/lib/dns/types";

describe("unit permissions and invitation secrecy", () => {
  it("limits submission to editor and unit admin, never a viewer or nonmember", () => {
    expect(canSubmitUnitRequest("VIEWER")).toBe(false);
    expect(canSubmitUnitRequest(null)).toBe(false);
    expect(canSubmitUnitRequest("EDITOR")).toBe(true);
    expect(canSubmitUnitRequest("ADMIN")).toBe(true);
  });
  it("preserves the last unit administrator", () => {
    expect(wouldRemoveLastAdmin("ADMIN", null, 1)).toBe(true);
    expect(wouldRemoveLastAdmin("ADMIN", "VIEWER", 1)).toBe(true);
    expect(wouldRemoveLastAdmin("ADMIN", "ADMIN", 1)).toBe(false);
    expect(wouldRemoveLastAdmin("ADMIN", "EDITOR", 2)).toBe(false);
  });
  it("generates opaque 192-bit invitations, hashes them, and redacts them in audit data", () => {
    const code = newPasscode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(newPasscode()).not.toBe(code);
    expect(passcodeHash(code)).toHaveLength(64);
    expect(passcodeHash(` ${code} `)).toBe(passcodeHash(code));
    expect(redactAudit({ passcode: code, passcodeHash: passcodeHash(code) })).toEqual({ passcode: "[REDACTED]", passcodeHash: "[REDACTED]" });
  });
});
describe("unit DNS change isolation", () => {
  const before: RRSet = { name: "host.example.com.", type: "A", ttl: 300, comments: [{ content: "keep me" }], records: [{ content: "192.0.2.1", disabled: true }, { content: "192.0.2.2", disabled: false }] };
  it("changes only the selected content, preserving TTL, disabled flags, comments and neighbors", () => {
    const after = replaceUnitValue(before, "192.0.2.1", "192.0.2.3");
    expect(after).toEqual({ ...before, records: [{ content: "192.0.2.3", disabled: true }, before.records[1]] });
    expect(before.records[0].content).toBe("192.0.2.1");
    expect(unitChangeState(before, before, after)).toBe("READY");
    expect(unitChangeState({ records: before.records, comments: before.comments, ttl: 300, type: "A", name: before.name }, before, after)).toBe("READY");
    expect(unitChangeState(after, before, after)).toBe("APPLIED");
    expect(unitChangeState({ ...before, ttl: 600 }, before, after)).toBe("CONFLICT");
    expect(unitChangeState(undefined, before, after)).toBe("CONFLICT");
  });
  it("rejects no-ops, missing old values and merging into another record", () => {
    expect(() => replaceUnitValue(before, "192.0.2.1", "192.0.2.1")).toThrow();
    expect(() => replaceUnitValue(before, "192.0.2.1", "192.0.2.2")).toThrow();
    expect(() => replaceUnitValue(before, "192.0.2.9", "192.0.2.3")).toThrow();
  });
});
