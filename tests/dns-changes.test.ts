import { expect, it } from "vitest";
import { changeSnapshot, snapshotKey } from "@/lib/dns-changes/snapshot";
import type { RRSet } from "@/lib/dns/types";
const rrset: RRSet = { name: "host.example.com.", type: "A", ttl: 300, records: [{ content: "192.0.2.1", disabled: false }, { content: "192.0.2.2", disabled: true }], comments: [{ content: "keep", account: "admin" }] };
it("compares DNS semantics independently of JSONB keys and record order", () => {
  expect(snapshotKey(rrset)).toBe(snapshotKey({ records: [...rrset.records].reverse(), ttl: 300, type: "A", name: rrset.name, comments: rrset.comments }));
  expect(snapshotKey({ ...rrset, ttl: 600 })).not.toBe(snapshotKey(rrset));
  expect(snapshotKey({ ...rrset, records: [{ ...rrset.records[0], disabled: true }] })).not.toBe(snapshotKey(rrset));
});
it("validates snapshot identities, rejects redacted or malformed payloads, and reads unit envelopes", () => {
  const event = { action: "CREATE_RECORD", zone: "example.com.", oldValue: null, newValue: rrset };
  expect(changeSnapshot(event)).toMatchObject({ operation: "CREATE", before: null, after: rrset });
  expect(changeSnapshot({ ...event, action: "APPLY_UNIT_DNS_REQUEST", oldValue: rrset, newValue: { rrset: null, operation: "DELETE" } })).toMatchObject({ operation: "DELETE", before: rrset, after: null });
  expect(changeSnapshot({ ...event, zone: "other.com." })).toBeNull();
  expect(changeSnapshot({ ...event, recordName: "wrong.example.com." })).toBeNull();
  expect(changeSnapshot({ ...event, newValue: { ...rrset, records: [{ content: "[REDACTED]", disabled: false }] } })).toBeNull();
  expect(changeSnapshot({ ...event, oldValue: rrset })).toBeNull();
  expect(changeSnapshot({ ...event, newValue: { ttl: 3 } })).toBeNull();
});
