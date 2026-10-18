import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/session", () => ({ AuthError: class extends Error {} }));
import type { DnsRequestPublication, Prisma } from "@prisma/client";
import { publicationState } from "@/lib/requests/publication";
import type { RRSet } from "@/lib/dns/types";

const after: RRSet = { name: "test.example.com.", type: "A", ttl: 300, records: [{ content: "192.0.2.1", disabled: false }] };
const publication: DnsRequestPublication = { requestId: "test", connectionScope: "original-server", actorId: "reviewer", beforeRRSet: null, afterRRSet: after as unknown as Prisma.JsonValue, createdAt: new Date(), completedAt: null };
describe("durable DNS publication reconciliation", () => {
  it("recognizes absent-before creation and confirmed publication despite JSONB key ordering", () => {
    expect(publicationState(publication, "original-server", undefined)).toBe("READY");
    expect(publicationState(publication, "original-server", { records: after.records, ttl: after.ttl, type: after.type, name: after.name })).toBe("APPLIED");
  });
  it("treats omitted and empty comments identically while preserving real comment conflicts", () => {
    expect(publicationState(publication, "original-server", { ...after, comments: [] })).toBe("APPLIED");
    const withEmpty = { ...publication, afterRRSet: { ...after, comments: [] } as unknown as Prisma.JsonValue };
    expect(publicationState(withEmpty, "original-server", after)).toBe("APPLIED");
    expect(() => publicationState(publication, "original-server", { ...after, comments: [{ content: "changed" }] })).toThrow("快照皆不同");
    expect(() => publicationState(publication, "original-server", { ...after, records: [{ ...after.records[0], disabled: true }] })).toThrow("快照皆不同");
  });
  it("never retries against a different server or a subsequently changed RRset", () => {
    expect(() => publicationState(publication, "new-server", after)).toThrow("PowerDNS");
    expect(() => publicationState(publication, "original-server", { ...after, ttl: 600 })).toThrow("快照皆不同");
  });
});
