import { z } from "zod";

export const templateVariables = ["applicationId", "applicantName", "unitName", "recordCount", "operation", "submittedAt", "reviewUrl"] as const;
export type MailVariables = Record<typeof templateVariables[number], string>;
export const defaultSubject = "[DNS Manager] {{unitName}} — {{operation}}申請（{{recordCount}} 筆）";
export const defaultBody = "網管小組您好：\n\n收到一份新的 DNS {{operation}}申請。\n申請編號：{{applicationId}}\n申請人：{{applicantName}}\n單位：{{unitName}}\n紀錄筆數：{{recordCount}}\n送出時間：{{submittedAt}}\n\n請登入系統審核：\n{{reviewUrl}}";
export function validTemplate(value: string) {
  const remainder = value.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => (templateVariables as readonly string[]).includes(key) ? "" : match);
  return !remainder.includes("{{") && !remainder.includes("}}");
}
const email = z.string().trim().max(254).email().refine(v => !/[\r\n]/.test(v));
const optionalEmail = z.union([email, z.literal("")]);
export const mailConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.literal("smtp-relay.gmail.com"),
  port: z.union([z.literal(465), z.literal(587)]),
  fromEmail: optionalEmail,
  fromName: z.string().trim().max(100).refine(v => !/[\r\n]/.test(v), "寄件名稱不可換行"),
  recipients: z.array(email).max(20).transform(v => [...new Set(v.map(e => e.toLowerCase()))]),
  subject: z.string().trim().min(1).max(300).refine(v => !/[\r\n]/.test(v), "主旨不可換行").refine(validTemplate, "主旨包含不支援的模板變數"),
  body: z.string().trim().min(1).max(20000).refine(validTemplate, "內文包含不支援的模板變數"),
}).strict().superRefine((v, ctx) => {
  if (!v.enabled) return;
  for (const key of ["fromEmail", "recipients"] as const) if (!v[key].length) ctx.addIssue({ code: "custom", path: [key], message: "啟用郵件通知前請填寫此欄位" });
});
export type MailConfig = z.infer<typeof mailConfigSchema>;
export const defaultMailConfig: MailConfig = { enabled: false, host: "smtp-relay.gmail.com", port: 587, fromEmail: "", fromName: "DNS Manager", recipients: [], subject: defaultSubject, body: defaultBody };
export const mailSaveSchema = z.object({ config: mailConfigSchema, expectedRevision: z.string().uuid().nullable() }).strict();
export type PublicMailSettings = { config: MailConfig; revision: string | null };
export function renderMail(config: Pick<MailConfig, "subject" | "body">, values: MailVariables) {
  const replace = (template: string) => template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: keyof MailVariables) => values[key] ?? "");
  return { subject: replace(config.subject).replace(/[\r\n]+/g, " ").slice(0, 998), text: replace(config.body) };
}
export const sampleMailVariables: MailVariables = { applicationId: "範例申請編號", applicantName: "王小明", unitName: "資訊工程學系", recordCount: "3", operation: "新增", submittedAt: "2026/10/14 10:00（台北時間）", reviewUrl: "https://dns.example.edu.tw/requests" };
export const deliveryLabels: Record<string, string> = { PENDING: "待寄送", SENDING: "寄送中", SENT: "SMTP 已接受", FAILED: "寄送失敗" };
