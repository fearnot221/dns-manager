import nodemailer from "nodemailer";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { publicMailSettings } from "@/lib/mail/settings";
import { defaultMailConfig, mailConfigSchema, renderMail, sampleMailVariables, validTemplate } from "@/lib/mail/model";
import { safeMailError } from "@/lib/mail/worker";
import { workspaceNavigation } from "@/lib/client/navigation";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MailSettingsForm, MailDeliveryPanel } from "@/components/admin/mail-settings";
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
    const html = renderToStaticMarkup(createElement(MailDeliveryPanel, { data: { settings: { config: defaultMailConfig, revision: null }, deliveries: [] }, reload: async () => {} }));
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
  it("rejects credential configuration and sanitizes SMTP errors", () => {
    expect(mailConfigSchema.safeParse({ ...defaultMailConfig, username: "user@example.com" }).success).toBe(false);
    expect(publicMailSettings({ config: defaultMailConfig, revision: null })).not.toHaveProperty("hasPassword");
    expect(safeMailError({ code: "EAUTH", message: "password=secret" })).not.toContain("secret");
  });
  it("limits navigation to global administrators and labels configuration inputs", () => {
    expect(workspaceNavigation(true, false).flatMap(g => g.items).some(i => i.href === "/admin/mail")).toBe(false);
    expect(workspaceNavigation(true, true).flatMap(g => g.items).some(i => i.href === "/admin/mail")).toBe(true);
    const html = renderToStaticMarkup(createElement(MailSettingsForm, { initial: { config: defaultMailConfig, revision: null }, onSaved: async () => {} }));
    expect(html).not.toContain('type="password"'); expect(html).not.toContain("dangerouslySetInnerHTML");
    for (const match of html.matchAll(/<(?:input|textarea|select)[^>]*id="([^"]+)"/g)) expect(html).toContain(`for="${match[1]}"`);
  });
});
