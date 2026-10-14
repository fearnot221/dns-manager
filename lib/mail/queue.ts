import "server-only";
import type { Prisma } from "@prisma/client";
import { readMailSettings } from "./settings";
import { renderMail, requestScenario, type MailConfig, type MailVariables, type ScenarioKey } from "./model";

type Tx = Prisma.TransactionClient;
type Message = { recipient: string; values: Record<string, string> };
const taipeiTime = (date = new Date()) => date.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false }) + "（台北時間）";
function appUrl(path: string) {
  const origin = new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000");
  return new URL(path, origin).href;
}
export function reviewUrl() { return appUrl("/requests"); }
/** Login-only placeholder addresses never receive mail. */
export function contactEmail(user: { email: string; portalEmail?: string | null }) {
  return user.portalEmail || (user.email.toLowerCase().endsWith("@accounts.invalid") ? null : user.email);
}
async function queue(tx: Tx, config: MailConfig, eventKey: string, template: { subject: string; body: string }, ccTeam: boolean, messages: Message[]) {
  if (!messages.length) return 0;
  const result = await tx.mailDelivery.createMany({ data: messages.map(({ recipient, values }) => ({ eventKey, recipient: recipient.toLowerCase(), fromEmail: config.fromEmail, fromName: config.fromName, ccTeam, ...renderMail(template, values) })), skipDuplicates: true });
  return result.count;
}
async function enqueueScenario(tx: Tx, eventKey: string, scenario: ScenarioKey, messages: (config: MailConfig) => Message[] | Promise<Message[]>) {
  const { config } = await readMailSettings(tx);
  const template = config.templates[scenario];
  if (!config.enabled || !template.enabled) return 0;
  return queue(tx, config, eventKey, template, template.ccTeam, await messages(config));
}

export async function enqueueDnsMail(tx: Tx, eventKey: string, values: Omit<MailVariables, "submittedAt" | "reviewUrl">) {
  const full = { ...values, submittedAt: taipeiTime(), reviewUrl: reviewUrl() };
  return enqueueScenario(tx, eventKey, requestScenario(values.operation), config => config.recipients.map(recipient => ({ recipient, values: full })));
}

const operationLabels: Record<string, string> = { CREATE: "新增", UPDATE: "修改", DELETE: "刪除" };
type ReviewedRequest = { id: string; operation: string; status: string; recordName: string; recordType: string; content: string; reviewNote: string | null; reviewedAt: Date | null; applicantName: string | null; applicantEmail: string | null; applicantUnit: string | null; user: { name: string | null; email: string; portalEmail: string | null } };
export async function enqueueReviewMail(tx: Tx, request: ReviewedRequest, unitName: string) {
  const approved = request.status === "APPROVED";
  const recipient = request.applicantEmail || contactEmail(request.user);
  if (!recipient) return 0;
  const values = {
    requestId: request.id, applicantName: request.applicantName || request.user.name || "申請人", unitName: unitName || request.applicantUnit || "",
    operation: operationLabels[request.operation] ?? request.operation, recordName: request.recordName, recordType: request.recordType, content: request.content,
    result: approved ? "核准" : "退回", reviewNote: request.reviewNote || "未提供", reviewedAt: taipeiTime(request.reviewedAt ?? new Date()), requestsUrl: reviewUrl(),
  };
  return enqueueScenario(tx, `dns-review:${request.id}`, approved ? "reviewApproved" : "reviewRejected", () => [{ recipient, values }]);
}

/** Active administrators of each unit with a deliverable address, one message per unit and administrator. */
export async function unitAdministrators(tx: Tx, unitIds?: string[]) {
  const units = await tx.dnsUnit.findMany({
    where: { status: "APPROVED", ...(unitIds ? { id: { in: unitIds } } : {}) }, orderBy: { name: "asc" },
    select: { id: true, name: true, members: { where: { role: "ADMIN", user: { disabled: false, removedAt: null } }, select: { user: { select: { name: true, email: true, portalEmail: true } } } } },
  });
  return units.map(unit => ({ id: unit.id, name: unit.name, admins: unit.members.map(({ user }) => ({ name: user.name || "", email: contactEmail(user) })) }));
}
const unitMessages = (units: Awaited<ReturnType<typeof unitAdministrators>>, values: Record<string, string>) => units.flatMap(unit => unit.admins.filter(admin => admin.email).map(admin => ({ unitId: unit.id, recipient: admin.email!, values: { ...values, unitName: unit.name, recipientName: admin.name || "單位管理員", dnsUrl: appUrl("/dns") } })));

export async function enqueueInspectionMail(tx: Tx, event: { id: string; name: string; startsOn: string; endsOn: string }) {
  const { config } = await readMailSettings(tx);
  const template = config.templates.inspectionCreated;
  if (!config.enabled || !template.enabled) return 0;
  let count = 0;
  for (const message of unitMessages(await unitAdministrators(tx), { eventName: event.name, startsOn: event.startsOn, endsOn: event.endsOn })) {
    count += await queue(tx, config, `inspection:${event.id}:${message.unitId}`, template, template.ccTeam, [message]);
  }
  return count;
}

export async function enqueueManualMail(tx: Tx, batchId: string, input: { unitIds: string[]; subject: string; body: string; ccTeam: boolean }) {
  const { config } = await readMailSettings(tx);
  let count = 0;
  for (const message of unitMessages(await unitAdministrators(tx, input.unitIds), {})) {
    count += await queue(tx, config, `manual:${batchId}:${message.unitId}`, input, input.ccTeam, [message]);
  }
  return count;
}
