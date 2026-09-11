import "server-only";
import type { Actor } from "@/lib/dns/types";
import { ApplicationInputError, requestRecordKey, type PreparedApplication } from "./application";

export type DevDnsRequest = {
  id: string;
  userId: string;
  applicationId?: string | null;
  applicantName?: string | null;
  applicantUnit?: string | null;
  applicantExtension?: string | null;
  zoneName: string;
  recordName: string;
  recordType: string;
  content: string;
  ttl: number;
  purpose: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  reviewerId: string | null;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string | null; email: string };
  reviewer: { name: string | null; email: string } | null;
};

const globalForRequests = globalThis as unknown as { dnsRequestStore?: DevDnsRequest[] };
const now = Date.now();
const seed: DevDnsRequest[] = [
  {
    id: "dev-request-user",
    userId: "dev-user",
    zoneName: "example.com.",
    recordName: "docs.example.com.",
    recordType: "CNAME",
    content: "docs.example.net.",
    ttl: 300,
    purpose: "Team documentation",
    status: "PENDING",
    reviewerId: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date(now - 15 * 60 * 1000),
    updatedAt: new Date(now - 15 * 60 * 1000),
    user: { id: "dev-user", name: "Aegis User", email: process.env.DEV_USER_EMAIL || "user@aegis.local" },
    reviewer: null,
  },
  {
    id: "dev-request-pending",
    userId: "dev-alice",
    zoneName: "example.com.",
    recordName: "portal.example.com.",
    recordType: "A",
    content: "140.115.154.57",
    ttl: 300,
    purpose: "Student portal",
    status: "PENDING",
    reviewerId: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date(now - 45 * 60 * 1000),
    updatedAt: new Date(now - 45 * 60 * 1000),
    user: { id: "dev-alice", name: "Alice Lin", email: "alice@example.com" },
    reviewer: null,
  },
  {
    id: "dev-request-approved",
    userId: "dev-bob",
    zoneName: "example.com.",
    recordName: "lab.example.com.",
    recordType: "AAAA",
    content: "2001:db8::28",
    ttl: 600,
    purpose: "IPv6 lab endpoint",
    status: "APPROVED",
    reviewerId: "dev-admin",
    reviewNote: "Approved for the fall semester.",
    reviewedAt: new Date(now - 20 * 60 * 60 * 1000),
    createdAt: new Date(now - 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - 20 * 60 * 60 * 1000),
    user: { id: "dev-bob", name: "Bob Chen", email: "bob@example.com" },
    reviewer: { name: "Development Admin", email: "admin@example.com" },
  },
];

const store = globalForRequests.dnsRequestStore ?? structuredClone(seed);
if (process.env.NODE_ENV !== "production") globalForRequests.dnsRequestStore = store;

export function isDevRequestStore() {
  return process.env.NODE_ENV !== "production" && !process.env.DATABASE_URL;
}
export function listDevRequests(actor: Actor) {
  if (actor.globalRole === "SUPER_ADMIN" || actor.globalRole === "ADMIN") return store;
  const managedZones = Object.entries(actor.zoneRoles).filter(([, role]) => role === "ADMIN").map(([zone]) => zone);
  return store.filter((item) => item.userId === actor.id || managedZones.includes(item.zoneName));
}
export function findDevRequest(id: string) {
  return store.find((item) => item.id === id) ?? null;
}
export function createDevApplication(actor: Actor, input: PreparedApplication, applicationId: string) {
  const pending = new Set(store.filter((item) => item.userId === actor.id && item.status === "PENDING").map(requestRecordKey));
  const { records, ...applicant } = input;
  records.forEach((record, index) => {
    const key = requestRecordKey(record);
    if (pending.has(key)) throw new ApplicationInputError(`第 ${index + 1} 筆：已有相同的待審核申請，整份申請尚未送出。`, 409);
    pending.add(key);
  });
  const created: DevDnsRequest[] = records.map((record) => ({
    ...record,
    ...applicant,
    applicationId,
    id: crypto.randomUUID(),
    userId: actor.id,
    status: "PENDING",
    reviewerId: null,
    reviewNote: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: actor.id, name: actor.name ?? null, email: actor.email },
    reviewer: null,
  }));
  // Prepare the entire batch before mutating the demo store.
  for (let index = created.length - 1; index >= 0; index--) store.unshift(created[index]);
  return created;
}
export function reviewDevRequest(id: string, actor: Actor, decision: "APPROVE" | "REJECT", reviewNote?: string) {
  const item = findDevRequest(id);
  if (!item) return null;
  item.status = decision === "APPROVE" ? "APPROVED" : "REJECTED";
  item.reviewNote = reviewNote || null;
  item.reviewerId = actor.id;
  item.reviewer = { name: actor.name ?? null, email: actor.email };
  item.reviewedAt = new Date();
  item.updatedAt = new Date();
  return item;
}
