import nodemailer from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { publicMailSettings } from "@/lib/mail/settings";
import { customVariables, defaultMailConfig, mailConfigSchema, renderMail, sampleMailVariables, scenarios, validTemplate } from "@/lib/mail/model";
import { safeMailError } from "@/lib/mail/worker";
import { workspaceNavigation } from "@/lib/client/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MailSettingsForm, MailTestSend } from "@/components/admin/mail-settings";
import { EmailChips } from "@/components/admin/mail-fields";
afterEach(() => vi.unstubAllEnvs());
describe("mail settings validation and secrets", () => {
  it("only allows Google endpoints and encrypted ports", () => {
    for (const host of ["localhost", "169.254.169.254", "smtp.gmail.com.evil.test", "smtp://smtp.gmail.com"]) expect(mailConfigSchema.safeParse({ ...defaultMailConfig, host }).success).toBe(false);
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, port: 25 }).success).toBe(false);
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, enabled: true }).success).toBe(false);
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, fromName: "Sender\r\nBcc: attacker@example.com" }).success).toBe(false);
  });
  it("accepts credential-free relay only and hides password inputs in IP mode", () => {
    const relay = { ...defaultMailConfig, enabled: true, fromEmail: "dns@example.com", recipients: ["team@example.com"] };
    expect(mailConfigSchema.safeParse(relay).success).toBe(true);
    expect(mailConfigSchema.safeParse({ ...relay, host: "smtp.gmail.com" }).success).toBe(false);
    expect(mailConfigSchema.safeParse({ ...relay, authMode: "password" }).success).toBe(false);
    const html = renderToStaticMarkup(createElement(MailSettingsForm, { initial: { config: relay, revision: null }, onSaved: async () => {} }));
    expect(html).toContain("IP 白名單驗證（免帳密）");
    expect(html).not.toContain('type="password"');
  });
  it("allows typing a test recipient before enabling mail while preventing premature sending", () => {
    const html = renderToStaticMarkup(createElement(MailTestSend, { template: "requestCreate", revision: null, enabled: false, dirty: false }));
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).not.toMatch(/<input[^>]*disabled/);
    expect(html).toMatch(/<button[^>]*disabled[^>]*>寄送測試信/);
    expect(html).toContain("CC 到網管小組收件地址");
  });
  it("includes a visible CC and deduplicates the SMTP envelope when To equals CC", async () => {
    const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });
    const result = await transport.sendMail({ from: "team@example.com", to: "team@example.com", cc: "team@example.com", subject: "test", text: "test" });
    expect(result.envelope.to).toEqual(["team@example.com"]);
    expect(result.message.toString()).toContain("Cc: team@example.com");
    transport.close();
  });
  it("validates variables without evaluating injected template code", () => {
    expect(validTemplate("{{constructor}} {{unknown}}")).toBe(false);
    expect(validTemplate("{{applicationId")).toBe(false);
    expect(validTemplate("{{ unitName }}")).toBe(true);
    const rendered = renderMail({ subject: "{{applicantName}}", body: "{{applicantName}}" }, { ...sampleMailVariables, applicantName: "<script>bad</script>\r\nBcc: no@example.com {{unitName}}" });
    expect(rendered.subject).not.toMatch(/[\r\n]/);
    expect(rendered.text).toContain("{{unitName}}");
  });
  it("upgrades a single legacy template into the request scenarios and keeps new scenarios off", () => {
    const { templates: _templates, customTemplates: _custom, ...legacy } = defaultMailConfig;
    void _templates; void _custom;
    const parsed = mailConfigSchema.parse({ ...legacy, subject: "舊主旨 {{unitName}}", body: "舊內文 {{operation}}" });
    for (const key of ["requestCreate", "requestUpdate", "requestDelete"] as const) expect(parsed.templates[key]).toMatchObject({ enabled: true, ccTeam: true, subject: "舊主旨 {{unitName}}", body: "舊內文 {{operation}}" });
    for (const key of ["reviewApproved", "reviewRejected", "inspectionCreated"] as const) expect(parsed.templates[key].enabled).toBe(false);
    expect(parsed.customTemplates).toEqual([]);
    expect(mailConfigSchema.safeParse({ ...legacy, templates: { requestCreate: defaultMailConfig.templates.requestCreate } }).success).toBe(true);
  });
  it("limits each scenario and custom template to its own variables", () => {
    expect(validTemplate("{{reviewNote}}", scenarios.reviewRejected.variables)).toBe(true);
    expect(validTemplate("{{reviewNote}}", scenarios.requestCreate.variables)).toBe(false);
    expect(validTemplate("{{eventName}} {{recipientName}}", scenarios.inspectionCreated.variables)).toBe(true);
    expect(validTemplate("{{applicationId}}", customVariables)).toBe(false);
    const templates = { ...defaultMailConfig.templates, reviewApproved: { ...defaultMailConfig.templates.reviewApproved, body: "{{applicationId}}" } };
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, templates }).success).toBe(false);
    const custom = { id: "notice", name: "公告", subject: "{{unitName}}", body: "{{recipientName}} {{dnsUrl}}" };
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, customTemplates: [custom] }).success).toBe(true);
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, customTemplates: [custom, custom] }).success).toBe(false);
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, customTemplates: [{ ...custom, body: "{{reviewUrl}}" }] }).success).toBe(false);
  });
  it("renders recipients as removable chips and marks malformed addresses", () => {
    const html = renderToStaticMarkup(createElement(EmailChips, { id: "r", value: ["team@example.com", "not-an-email"], onChange: () => {}, max: 20 }));
    expect(html).toContain('aria-label="移除 team@example.com"');
    expect(html).toMatch(/class="chip is-invalid"[^>]*><span>not-an-email/);
    expect(renderToStaticMarkup(createElement(EmailChips, { id: "r", value: Array.from({ length: 2 }, (_, i) => `a${i}@example.com`), onChange: () => {}, max: 2 }))).toMatch(/<input[^>]*disabled/);
  });
  it("rejects credential configuration and sanitizes SMTP errors", () => {
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, username: "user@example.com" }).success).toBe(false);
    expect(publicMailSettings({ config: defaultMailConfig, revision: null })).not.toHaveProperty("hasPassword");
    expect(safeMailError({ code: "EAUTH", message: "password=secret" })).not.toContain("secret");
  });
  it("distinguishes temporary SMTP rejection from network and TLS failures without exposing responses", () => {
    for (const responseCode of [421, 450, 451, 454]) {
      const message = safeMailError({ code: "ECONNECTION", responseCode, command: "EHLO", message: "secret", response: "private@example.com" });
      expect(message).toContain(`暫時拒絕寄送（${responseCode}）`);
      expect(message).not.toMatch(/無法連線|secret|private@example.com/);
    }
    expect(safeMailError({ code: "ECONNECTION" })).toContain("無法連線");
    expect(safeMailError({ code: "EDNS" })).toContain("無法連線");
    expect(safeMailError(null)).toContain("寄送未完成");
    expect(safeMailError({ responseCode: 550 })).not.toContain("暫時拒絕");
  });
  it("limits navigation to global administrators and labels configuration inputs", () => {
    expect(workspaceNavigation(true, false).flatMap(g => g.items).some(i => i.href === "/admin/mail")).toBe(false);
    expect(workspaceNavigation(true, true).flatMap(g => g.items).some(i => i.href === "/admin/mail")).toBe(true);
    const html = renderToStaticMarkup(createElement(MailSettingsForm, { initial: { config: defaultMailConfig, revision: null }, onSaved: async () => {} }));
    expect(html).not.toContain('type="password"'); expect(html).not.toContain("dangerouslySetInnerHTML");
    for (const match of html.matchAll(/<(?:input|textarea|select)[^>]*id="([^"]+)"/g)) expect(html).toContain(`for="${match[1]}"`);
  });
});
