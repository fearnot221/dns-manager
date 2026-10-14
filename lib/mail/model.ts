import { z } from "zod";

type Vars = readonly string[];
const requestVars = ["applicationId", "applicantName", "unitName", "recordCount", "operation", "submittedAt", "reviewUrl"] as const;
const reviewVars = ["requestId", "applicantName", "unitName", "operation", "recordName", "recordType", "content", "result", "reviewNote", "reviewedAt", "requestsUrl"] as const;
const inspectionVars = ["recipientName", "unitName", "eventName", "startsOn", "endsOn", "dnsUrl"] as const;
/** Variables for custom templates and messages sent manually to unit administrators. */
export const customVariables = ["recipientName", "unitName", "dnsUrl"] as const;
/** Kept for the request notification templates and existing callers. */
export const templateVariables = requestVars;
export type MailVariables = Record<typeof requestVars[number], string>;

const requestBody = (operation: string) => `網管小組您好：\n\n收到一份新的 DNS ${operation}申請。\n申請編號：{{applicationId}}\n申請人：{{applicantName}}\n單位：{{unitName}}\n紀錄筆數：{{recordCount}}\n送出時間：{{submittedAt}}\n\n請登入系統審核：\n{{reviewUrl}}`;
export const defaultSubject = "[DNS Manager] {{unitName}} — {{operation}}申請（{{recordCount}} 筆）";
export const defaultBody = "網管小組您好：\n\n收到一份新的 DNS {{operation}}申請。\n申請編號：{{applicationId}}\n申請人：{{applicantName}}\n單位：{{unitName}}\n紀錄筆數：{{recordCount}}\n送出時間：{{submittedAt}}\n\n請登入系統審核：\n{{reviewUrl}}";

const sampleRequest = (operation: string, recordCount: string): Record<string, string> => ({ applicationId: "範例申請編號", applicantName: "王小明", unitName: "資訊工程學系", recordCount, operation, submittedAt: "2026/10/14 10:00（台北時間）", reviewUrl: "https://dns.example.edu.tw/requests" });
const sampleReview = (result: string, reviewNote: string): Record<string, string> => ({ requestId: "範例申請編號", applicantName: "王小明", unitName: "資訊工程學系", operation: "新增", recordName: "www.example.edu.tw.", recordType: "A", content: "192.0.2.10", result, reviewNote, reviewedAt: "2026/10/15 09:30（台北時間）", requestsUrl: "https://dns.example.edu.tw/requests" });
const sampleUnit: Record<string, string> = { recipientName: "陳大文", unitName: "資訊工程學系", eventName: "115 學年度上學期 DNS 清查", startsOn: "2026-11-01", endsOn: "2026-11-30", dnsUrl: "https://dns.example.edu.tw/dns" };

export const scenarioKeys = ["requestCreate", "requestUpdate", "requestDelete", "reviewApproved", "reviewRejected", "inspectionCreated"] as const;
export type ScenarioKey = typeof scenarioKeys[number];
export type Scenario = { label: string; group: string; audience: string; variables: Vars; sample: Record<string, string>; defaults: TemplateConfig };
export type TemplateConfig = { enabled: boolean; ccTeam: boolean; subject: string; body: string };
export const scenarioGroups = [
  { id: "request", label: "申請通知", audience: "網管小組" },
  { id: "review", label: "審核結果", audience: "申請人" },
  { id: "inspection", label: "清查活動", audience: "單位管理員" },
] as const;
export const scenarios: Record<ScenarioKey, Scenario> = {
  requestCreate: { label: "新增申請", group: "request", audience: "網管小組", variables: requestVars, sample: sampleRequest("新增", "3"), defaults: { enabled: true, ccTeam: true, subject: "[DNS Manager] {{unitName}} — 新增申請（{{recordCount}} 筆）", body: requestBody("新增") } },
  requestUpdate: { label: "修改申請", group: "request", audience: "網管小組", variables: requestVars, sample: sampleRequest("修改", "1"), defaults: { enabled: true, ccTeam: true, subject: "[DNS Manager] {{unitName}} — 修改申請", body: requestBody("修改") } },
  requestDelete: { label: "刪除申請", group: "request", audience: "網管小組", variables: requestVars, sample: sampleRequest("刪除", "1"), defaults: { enabled: true, ccTeam: true, subject: "[DNS Manager] {{unitName}} — 刪除申請", body: requestBody("刪除") } },
  reviewApproved: { label: "申請核准", group: "review", audience: "申請人", variables: reviewVars, sample: sampleReview("核准", ""), defaults: { enabled: false, ccTeam: false, subject: "[DNS Manager] DNS {{operation}}申請已核准：{{recordName}}", body: "{{applicantName}} 您好：\n\n您為「{{unitName}}」提出的 DNS {{operation}}申請已核准並生效。\n紀錄：{{recordName}}（{{recordType}}）\n內容：{{content}}\n審核時間：{{reviewedAt}}\n\n申請紀錄：\n{{requestsUrl}}" } },
  reviewRejected: { label: "申請退回", group: "review", audience: "申請人", variables: reviewVars, sample: sampleReview("退回", "解析內容與用途不符，請確認後重新申請。"), defaults: { enabled: false, ccTeam: false, subject: "[DNS Manager] DNS {{operation}}申請已退回：{{recordName}}", body: "{{applicantName}} 您好：\n\n您為「{{unitName}}」提出的 DNS {{operation}}申請已退回。\n紀錄：{{recordName}}（{{recordType}}）\n內容：{{content}}\n退回原因：{{reviewNote}}\n\n如需協助，請直接回覆此郵件。\n申請紀錄：\n{{requestsUrl}}" } },
  inspectionCreated: { label: "清查活動排定", group: "inspection", audience: "單位管理員", variables: inspectionVars, sample: sampleUnit, defaults: { enabled: false, ccTeam: false, subject: "[DNS Manager] {{eventName}} 清查通知", body: "{{recipientName}} 您好：\n\n網管小組將於 {{startsOn}} 至 {{endsOn}} 進行「{{eventName}}」。\n請協助確認「{{unitName}}」的 DNS 用途與聯絡資料，並於期間內完成清查：\n{{dnsUrl}}\n\n如有疑問，請直接回覆此郵件。" } },
};
export const customSample: Record<string, string> = { recipientName: sampleUnit.recipientName, unitName: sampleUnit.unitName, dnsUrl: sampleUnit.dnsUrl };

export function validTemplate(value: string, variables: Vars = requestVars) {
  const remainder = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => variables.includes(key) ? "" : match);
  return !remainder.includes("{{") && !remainder.includes("}}");
}
const email = z.string().trim().max(254).email().refine(v => !/[\r\n]/.test(v));
const optionalEmail = z.union([email, z.literal("")]);
const subjectFor = (variables: Vars) => z.string().trim().min(1, "請填寫主旨").max(300).refine(v => !/[\r\n]/.test(v), "主旨不可換行").refine(v => validTemplate(v, variables), "主旨包含不支援的模板變數");
const bodyFor = (variables: Vars) => z.string().trim().min(1, "請填寫內文").max(20000).refine(v => validTemplate(v, variables), "內文包含不支援的模板變數");
const templateSchema = (variables: Vars) => z.object({ enabled: z.boolean(), ccTeam: z.boolean(), subject: subjectFor(variables), body: bodyFor(variables) }).strict();
export const customTemplateSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: z.string().trim().min(1, "請填寫模板名稱").max(60), subject: subjectFor(customVariables), body: bodyFor(customVariables) }).strict();
export type CustomTemplate = z.infer<typeof customTemplateSchema>;
export const manualMessageSchema = z.object({ subject: subjectFor(customVariables), body: bodyFor(customVariables) });

const defaultTemplates = () => Object.fromEntries(scenarioKeys.map(key => [key, { ...scenarios[key].defaults }])) as Record<ScenarioKey, TemplateConfig>;
/** Settings saved before per-scenario templates used one subject/body for every request notification. */
function upgradeStoredConfig(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const { subject, body, ...rest } = raw as Record<string, unknown>;
  if (subject === undefined && body === undefined && "templates" in rest) {
    const stored = rest.templates && typeof rest.templates === "object" ? rest.templates as Record<string, unknown> : {};
    return { customTemplates: [], ...rest, templates: { ...defaultTemplates(), ...stored } };
  }
  const templates = defaultTemplates();
  if (typeof subject === "string" && typeof body === "string") for (const key of ["requestCreate", "requestUpdate", "requestDelete"] as const) templates[key] = { ...templates[key], subject, body };
  return { customTemplates: [], ...rest, templates: { ...templates, ...(rest.templates as object | undefined) } };
}
export const mailConfigSchema = z.preprocess(upgradeStoredConfig, z.object({
  enabled: z.boolean(),
  host: z.literal("smtp-relay.gmail.com"),
  port: z.union([z.literal(465), z.literal(587)]),
  fromEmail: optionalEmail,
  fromName: z.string().trim().max(100).refine(v => !/[\r\n]/.test(v), "寄件名稱不可換行"),
  recipients: z.array(email).max(20, "最多 20 個收件地址").transform(v => [...new Set(v.map(e => e.toLowerCase()))]),
  templates: z.object(Object.fromEntries(scenarioKeys.map(key => [key, templateSchema(scenarios[key].variables)])) as Record<ScenarioKey, ReturnType<typeof templateSchema>>).strict(),
  customTemplates: z.array(customTemplateSchema).max(20, "最多 20 個自訂模板").refine(list => new Set(list.map(t => t.id)).size === list.length, "自訂模板識別碼重複"),
}).strict().superRefine((v, ctx) => {
  if (!v.enabled) return;
  for (const key of ["fromEmail", "recipients"] as const) if (!v[key].length) ctx.addIssue({ code: "custom", path: [key], message: "啟用郵件通知前請填寫此欄位" });
}));
export type MailConfig = z.output<typeof mailConfigSchema>;
export const defaultMailConfig: MailConfig = { enabled: false, host: "smtp-relay.gmail.com", port: 587, fromEmail: "", fromName: "DNS Manager", recipients: [], templates: defaultTemplates(), customTemplates: [] };
export const mailSaveSchema = z.object({ config: mailConfigSchema, expectedRevision: z.string().uuid().nullable() }).strict();
export type PublicMailSettings = { config: MailConfig; revision: string | null };
export function renderMail(template: { subject: string; body: string }, values: Record<string, string>) {
  const replace = (text: string) => text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => Object.hasOwn(values, key) ? values[key] : "");
  return { subject: replace(template.subject).replace(/[\r\n]+/g, " ").slice(0, 998), text: replace(template.body) };
}
export const sampleMailVariables: MailVariables = sampleRequest("新增", "3") as MailVariables;
export const requestScenario = (operation: string): ScenarioKey => operation === "刪除" ? "requestDelete" : operation === "修改" ? "requestUpdate" : "requestCreate";
export const deliveryLabels: Record<string, string> = { PENDING: "待寄送", SENDING: "寄送中", SENT: "SMTP 已接受", FAILED: "寄送失敗" };
