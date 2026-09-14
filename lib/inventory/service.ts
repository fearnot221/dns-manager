import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { powerdns } from "@/lib/powerdns/client";
import { connectionEnvironment } from "@/lib/powerdns/settings";
import { listDevRequests } from "@/lib/requests/dev-store";
import { canManageZone } from "@/lib/auth/permissions";
import { ApiError } from "@/lib/api/respond";
import type { Actor, RRSet } from "@/lib/dns/types";
import type { InventoryRecord, Ownership } from "./types";
import { zoneCategory } from "@/lib/dns/zone-category";

type Identity = Pick<InventoryRecord, "zoneName" | "recordName" | "recordType" | "content">;
type Stored = Identity & Ownership;
type Store = { records: Record<string, Stored> };
export async function connectionScope() { const env = await connectionEnvironment(); return env.PDNS_MOCK === "true" ? "local-mock" : `${env.PDNS_API_URL}|${env.PDNS_SERVER_ID || "localhost"}`; }
export function recordId(scope: string, record: Identity) { return createHash("sha256").update(JSON.stringify([scope, record.zoneName.toLowerCase(), record.recordName.toLowerCase(), record.recordType, record.content])).digest("hex"); }
const identityKey = (record: Identity) => JSON.stringify([record.zoneName, record.recordName, record.recordType, record.content]);
const emptyOwnership = (id: string): Ownership => ({ id, applicantName: "", applicantEmail: "", applicantUnit: "", applicantExtension: "", purpose: "", updatedBy: "", updatedAt: null, inspections: [] });

export async function describeRecords(actor: Actor, zoneName: string, rrsets: RRSet[]): Promise<InventoryRecord[]> {
  const scope = await connectionScope();
  const records = rrsets.flatMap((rrset) => rrset.records.map((record) => ({ zoneName, recordName: rrset.name, recordType: rrset.type, content: record.content, ttl: rrset.ttl, disabled: record.disabled })));
  const ids = records.map((record) => recordId(scope, record));
  const saved = isLocalDemo() ? await localDocument<Store, Stored[]>("inventory", async () => ({ records: {} }), (data) => ids.flatMap((id) => data.records[id] ? [data.records[id]] : [])) : await db.dnsRecordMetadata.findMany({ where: { id: { in: ids } }, include: { inspections: { orderBy: { inspectedAt: "desc" } } } });
  const updaterEmails = [...new Set(saved.map((item) => item.updatedBy).filter(Boolean))];
  const updaters = !isLocalDemo() && updaterEmails.length ? await db.user.findMany({ where: { email: { in: updaterEmails } }, select: { email: true, name: true } }) : [{ email: actor.email, name: actor.name }];
  const updaterNames = new Map(updaters.map((user) => [user.email, user.name]));
  const savedById = new Map(saved.map((item) => [item.id, item]));
  // Legacy applications have no connection ID; never infer ownership after switching a live server.
  const legacyAllowed = scope === "local-mock";
  const approved = !legacyAllowed ? [] : isLocalDemo() ? listDevRequests(actor).filter((r) => r.zoneName === zoneName && r.status === "APPROVED") : await db.dnsRecordRequest.findMany({ where: { zoneName, status: "APPROVED" }, include: { user: { select: { email: true, name: true } } }, orderBy: { reviewedAt: "asc" } });
  const applications = new Map(approved.map((r) => [identityKey(r), r]));
  return records.map((record) => {
    const id = recordId(scope, record); const saved = savedById.get(id); const application = applications.get(identityKey(record));
    const ownership: Ownership = saved ? { id, applicantName: saved.applicantName, applicantEmail: saved.applicantEmail, applicantUnit: saved.applicantUnit, applicantExtension: saved.applicantExtension, purpose: saved.purpose, updatedBy: saved.updatedBy, updatedByName: updaterNames.get(saved.updatedBy), updatedAt: new Date(saved.updatedAt!).toISOString(), inspections: saved.inspections.map((review) => ({ ...review, inspectedAt: new Date(review.inspectedAt).toISOString() })) } : { ...emptyOwnership(id), applicantName: application?.applicantName || application?.user.name || "", applicantEmail: application?.user.email || "", applicantUnit: application?.applicantUnit || "", applicantExtension: application?.applicantExtension || "", purpose: application?.purpose || "" };
    return { ...record, ownership };
  });
}
export async function listInventory(actor: Actor) {
  const zones = (await powerdns.listZones()).filter((zone) => zoneCategory(zone.name) === "forward" && canManageZone(actor, zone.name));
  const result: InventoryRecord[] = [];
  for (let index = 0; index < zones.length; index += 4) {
    const batch = await Promise.all(zones.slice(index, index + 4).map(async (zone) => describeRecords(actor, zone.name, (await powerdns.getZone(zone.name)).rrsets)));
    result.push(...batch.flat());
  }
  return result;
}

/** Snapshot ownership at approval, including after a live connection has been configured. */
export async function captureApprovedRequest(actor: Actor, request: Identity & { applicantName?: string | null; applicantUnit?: string | null; applicantExtension?: string | null; purpose?: string | null; user: { email: string; name?: string | null } }) {
  const { zoneName, recordName, recordType, content } = request;
  const id = recordId(await connectionScope(), request);
  const fields = { id, zoneName, recordName, recordType, content, applicantName: request.applicantName || request.user.name || "", applicantEmail: request.user.email, applicantUnit: request.applicantUnit || "", applicantExtension: request.applicantExtension || "", purpose: request.purpose || "", updatedBy: actor.email };
  if (isLocalDemo()) return localDocument<Store, void>("inventory", async () => ({ records: {} }), (data) => { if (!data.records[id]) data.records[id] = { ...fields, updatedAt: new Date().toISOString(), inspections: [] }; }, true);
  await db.dnsRecordMetadata.upsert({ where: { id }, create: fields, update: {} });
}

export async function saveInventory(actor: Actor, input: Identity & { id: string; expectedUpdatedAt: string | null; mode: "metadata" | "inspect"; applicantName: string; applicantEmail: string; applicantUnit: string; applicantExtension: string; purpose: string; note: string }) {
  if (input.mode === "inspect" && zoneCategory(input.zoneName) !== "forward") throw new ApiError("DNS 定期清查僅適用於一般網域。", 400);
  if (!canManageZone(actor, input.zoneName)) throw new ApiError("找不到可管理的 DNS 紀錄。", 404);
  if (input.id !== recordId(await connectionScope(), input)) throw new ApiError("DNS 連線已變更，請重新載入。", 409);
  const zone = await powerdns.getZone(input.zoneName);
  const live = (await describeRecords(actor, input.zoneName, zone.rrsets)).find((record) => record.ownership.id === input.id);
  if (!live) throw new ApiError("此解析值已不存在，請重新載入。", 409);
  const { zoneName, recordName, recordType, content } = input;
  const fields = input.mode === "metadata" ? { applicantName: input.applicantName, applicantEmail: input.applicantEmail, applicantUnit: input.applicantUnit, applicantExtension: input.applicantExtension, purpose: input.purpose } : { applicantName: live.ownership.applicantName, applicantEmail: live.ownership.applicantEmail, applicantUnit: live.ownership.applicantUnit, applicantExtension: live.ownership.applicantExtension, purpose: live.ownership.purpose };
  const inspection = { id: crypto.randomUUID(), inspectedAt: new Date().toISOString(), inspectorId: actor.id, inspectorEmail: actor.email, inspectorName: actor.name || actor.email, note: input.note };
  const checkVersion = (updatedAt: string | Date | null | undefined) => { if ((updatedAt ? new Date(updatedAt).toISOString() : null) !== input.expectedUpdatedAt) throw new ApiError("資料已由其他人更新，請重新載入後再儲存。", 409); };
  if (isLocalDemo()) return localDocument("inventory", async () => ({ records: {} } as Store), (data) => {
    const previous = data.records[input.id]; checkVersion(previous?.updatedAt);
    data.records[input.id] = { id: input.id, zoneName, recordName, recordType, content, ...fields, updatedAt: new Date().toISOString(), updatedBy: actor.email, inspections: input.mode === "inspect" ? [inspection, ...(previous?.inspections || [])] : previous?.inspections || [] };
    return { before: previous ?? live.ownership, after: data.records[input.id] };
  }, true);
  return db.$transaction(async (tx) => {
    const current = await tx.dnsRecordMetadata.findUnique({ where: { id: input.id } }); checkVersion(current?.updatedAt);
    const saved = await tx.dnsRecordMetadata.upsert({ where: { id: input.id }, create: { id: input.id, zoneName, recordName, recordType, content, ...fields, updatedBy: actor.email }, update: { ...fields, updatedBy: actor.email, updatedAt: new Date() } });
    if (input.mode === "inspect") await tx.dnsInspection.create({ data: { ...inspection, recordId: input.id, inspectedAt: new Date(inspection.inspectedAt) } });
    return { before: current ?? live.ownership, after: { ...saved, ...(input.mode === "inspect" ? { inspection } : {}) } };
  }, { isolationLevel: "Serializable" });
}
