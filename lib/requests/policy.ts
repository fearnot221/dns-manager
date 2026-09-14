import "server-only";
import { db } from "@/lib/db/client";
import { isLocalDemo, localDocument } from "@/lib/db/local-store";
import { ApiError } from "@/lib/api/respond";
import { applicationPolicySchema, defaultApplicationPolicy, policyViolation, type ApplicationPolicy } from "./policy-model";
import type { Actor } from "@/lib/dns/types";
import type { Prisma } from "@prisma/client";
const key = "dns-application-policy";
export async function readApplicationPolicy(tx: Prisma.TransactionClient = db): Promise<ApplicationPolicy> {
  if (isLocalDemo()) return localDocument(key, async () => ({ policy: defaultApplicationPolicy }), (data) => data.policy);
  const saved = await tx.systemSetting.findUnique({ where: { key } });
  return saved ? { ...applicationPolicySchema.parse(saved.value), updatedAt: saved.updatedAt.toISOString() } : { ...defaultApplicationPolicy };
}
export async function assertApplicationPolicy(actor: Actor, types: string[], unitId?: string, tx: Prisma.TransactionClient = db) {
  const policy = await readApplicationPolicy(tx);
  const member = policy.ownership === "ANY" ? true : !isLocalDemo() && await tx.unitMember.count({ where: { userId: actor.id } }) > 0;
  const violation = policyViolation(policy, types, unitId, member);
  if (violation) throw new ApiError(violation, 403);
}
export async function saveApplicationPolicy(value: unknown, expectedUpdatedAt: string | null) {
  const policy = applicationPolicySchema.parse(value);
  const check = (before: ApplicationPolicy) => { if (before.updatedAt !== expectedUpdatedAt) throw new ApiError("申請設定已更新，請重新載入。", 409); };
  if (isLocalDemo()) return localDocument(key, async () => ({ policy: defaultApplicationPolicy }), (data) => {
    const before = data.policy; check(before);
    data.policy = { ...policy, updatedAt: new Date(Math.max(Date.now(), Date.parse(before.updatedAt || "") + 1 || 0)).toISOString() };
    return { before, after: data.policy };
  }, true);
  return db.$transaction(async (tx) => {
    const before = await readApplicationPolicy(tx); check(before);
    const updatedAt = new Date(Math.max(Date.now(), (before.updatedAt ? Date.parse(before.updatedAt) : 0) + 1));
    const saved = await tx.systemSetting.upsert({ where: { key }, create: { key, value: policy, updatedAt }, update: { value: policy, updatedAt } });
    return { before, after: { ...policy, updatedAt: saved.updatedAt.toISOString() } };
  }, { isolationLevel: "Serializable" });
}
