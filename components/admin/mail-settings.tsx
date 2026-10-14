"use client";
import { useId, useRef, useState } from "react";
import { Mail, RefreshCw, RotateCcw, Send } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Badge, LoadingPanel } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { defaultBody, defaultSubject, deliveryLabels, mailSaveSchema, renderMail, sampleMailVariables, templateVariables, type MailConfig, type PublicMailSettings } from "@/lib/mail/model";

type Delivery = { id: string; eventKey: string; recipient: string; subject: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };
type Resource = { settings: PublicMailSettings; deliveries: Delivery[] };
const dateLabel = (value: string) => new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
const deliveryTones: Record<string, "neutral" | "green" | "orange" | "blue" | "red"> = { PENDING: "neutral", SENDING: "blue", SENT: "green", FAILED: "red" };
export function MailSettings() {
  const resource = useResource<Resource>("/api/admin/mail");
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <LoadingPanel label="載入郵件設定…" />;
  return <div className="workflow-page">
    <MailSettingsForm key={resource.data.settings.revision || "initial"} initial={resource.data.settings} onSaved={resource.reload} />
    <MailDeliveryPanel data={resource.data} reload={resource.reload} />
  </div>;
}
export function MailSettingsForm({ initial, onSaved }: { initial: PublicMailSettings; onSaved: () => Promise<void> }) {
  const [config, setConfig] = useState(initial.config);
  const [recipients, setRecipients] = useState(initial.config.recipients.join("\n"));
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const body = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = useId();
  const update = <K extends keyof MailConfig>(key: K, value: MailConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
  const props = (key: string, help?: string) => ({ id: `${id}-${key}`, "aria-invalid": !!errors[key] || undefined, "aria-describedby": [`${id}-feedback`, help, errors[key] && `${id}-${key}-error`].filter(Boolean).join(" ") });
  const error = (key: string) => errors[key] ? <span id={`${id}-${key}-error`} className="field-error">{errors[key]}</span> : null;
  const preview = renderMail(config, sampleMailVariables);
  function insertVariable(name: string) {
    const field = body.current;
    const token = `{{${name}}}`;
    const start = field?.selectionStart ?? config.body.length;
    const end = field?.selectionEnd ?? start;
    update("body", config.body.slice(0, start) + token + config.body.slice(end));
    requestAnimationFrame(() => { field?.focus(); field?.setSelectionRange(start + token.length, start + token.length); });
  }
  return <section className="card">
    <header className="workflow-panel-head"><Mail size={20} aria-hidden="true" /><div><h2>通知設定</h2><p>DNS 申請送出時通知網管小組</p></div><Badge tone={initial.config.enabled ? "green" : "neutral"}>{initial.config.enabled ? "已啟用" : "已停用"}</Badge></header>
    <div className="workflow-feedback" id={`${id}-feedback`}><ActionFeedback feedback={feedback} /></div>
    <form className="form-surface" onSubmit={async event => {
      event.preventDefault(); if (saving.current) return;
      const form = event.currentTarget;
      const input = { config: { ...config, recipients: recipients.split(/[\n,;]+/).map(v => v.trim()).filter(Boolean) }, expectedRevision: initial.revision };
      const parsed = mailSaveSchema.safeParse(input);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues) fields[String(issue.path[0] === "config" ? issue.path[1] : issue.path[0])] = issue.message;
        setErrors(fields); setFeedback({ kind: "error", message: "請修正標示的欄位後再儲存。" });
        const key = Object.keys(fields)[0]; form.querySelector<HTMLElement>(`[id="${id}-${key}"]`)?.focus(); return;
      }
      saving.current = true; setPending(true); setErrors({}); setFeedback(null);
      try {
        await apiRequest("/api/admin/mail", jsonRequest("PUT", parsed.data));
        setFeedback({ kind: "success", message: "郵件設定已儲存。" });
        await onSaved();
      } catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "儲存失敗" }); }
      finally { saving.current = false; setPending(false); }
    }}>
      <fieldset className="form-fields" disabled={pending}>
        <legend className="mail-section-title">寄送設定</legend>
        <div className="mail-toggle"><input id={`${id}-enabled`} type="checkbox" role="switch" checked={config.enabled} onChange={e => update("enabled", e.target.checked)} aria-describedby={`${id}-enabled-help`} /><label htmlFor={`${id}-enabled`}>啟用申請通知</label><small id={`${id}-enabled-help`}>新增、修改與刪除申請皆會通知；停用期間的申請不補寄。</small></div>
        <div className="mail-relay"><code>smtp-relay.gmail.com</code><span>IP 白名單驗證（免帳密）</span>
          <details><summary>設定需求</summary><p>於 Google 管理控制台允許 VM 公網出口 IP 與寄件網域，並要求 TLS；寄件地址須符合該政策。</p></details>
        </div>
        <div className="mail-grid">
          <label>加密連線<Select aria-label="加密連線" value={config.port} onChange={value => update("port", Number(value) as 465 | 587)} options={[{ value: "587", label: "587 · STARTTLS" }, { value: "465", label: "465 · TLS" }]} />{error("port")}</label>
          <label htmlFor={`${id}-fromName`}>寄件者名稱<input {...props("fromName")} maxLength={100} value={config.fromName} onChange={e => update("fromName", e.target.value)} />{error("fromName")}</label>
          <label htmlFor={`${id}-fromEmail`}>寄件地址<input {...props("fromEmail")} type="email" required={config.enabled} value={config.fromEmail} onChange={e => update("fromEmail", e.target.value)} placeholder="dns@example.edu.tw" />{error("fromEmail")}</label>
        </div>
        <label htmlFor={`${id}-recipients`}>網管小組收件地址<textarea {...props("recipients", `${id}-recipients-help`)} required={config.enabled} rows={3} maxLength={5200} value={recipients} onChange={e => setRecipients(e.target.value)} />{error("recipients")}<small id={`${id}-recipients-help`}>每封通知皆 CC 並作為回覆地址；每行一個或以逗號分隔，最多 20 個。</small></label>
      </fieldset>
      <fieldset className="form-fields mail-template" disabled={pending}>
        <legend className="mail-section-title">郵件模板</legend>
        <label htmlFor={`${id}-subject`}>主旨<input {...props("subject")} required maxLength={300} value={config.subject} onChange={e => update("subject", e.target.value)} />{error("subject")}</label>
        <div className="mail-template-grid">
          <div className="mail-template-editor">
            <label htmlFor={`${id}-body`}>內文<textarea ref={body} {...props("body", `${id}-variables`)} required rows={12} maxLength={20000} value={config.body} onChange={e => update("body", e.target.value)} />{error("body")}</label>
            <div className="mail-variables" id={`${id}-variables`} role="group" aria-label="插入變數">{templateVariables.map(v => <button type="button" key={v} onClick={() => insertVariable(v)} aria-label={`插入變數 ${v}`}>{`{{${v}}}`}</button>)}</div>
          </div>
          <figure className="mail-preview" aria-label="模板預覽">
            <figcaption>預覽<small>範例資料</small></figcaption>
            <strong>{preview.subject}</strong>
            <pre>{preview.text}</pre>
          </figure>
        </div>
      </fieldset>
      <div className="mail-form-actions">
        <button type="button" className="button ghost" disabled={pending} onClick={() => setConfig(v => ({ ...v, subject: defaultSubject, body: defaultBody }))}><RotateCcw size={15} aria-hidden="true" />還原預設模板</button>
        <button className="button primary" disabled={pending} aria-busy={pending}>{pending ? "儲存中…" : "儲存設定"}</button>
      </div>
    </form>
  </section>;
}
export function MailDeliveryPanel({ data, reload }: { data: Resource; reload: () => Promise<void> }) {
  const [recipient, setRecipient] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const id = useId();
  const enabled = data.settings.config.enabled;
  async function action(input: unknown) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try { await apiRequest("/api/admin/mail", jsonRequest("POST", input)); setFeedback({ kind: "success", message: "已排入寄送，稍後重新整理即可查看結果。" }); await reload(); }
    catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "操作失敗" }); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="card table-card">
    <header className="workflow-panel-head"><Send size={20} aria-hidden="true" /><div><h2>寄送紀錄</h2><p>最近 30 筆 · 台北時間</p></div><button type="button" className="icon-button" disabled={pending} onClick={() => void reload()} aria-label="重新整理寄送紀錄" title="重新整理"><RefreshCw size={16} aria-hidden="true" /></button></header>
    <div className="workflow-feedback" id={`${id}-feedback`}><ActionFeedback feedback={feedback} /></div>
    <form className="form-surface mail-test" onSubmit={e => { e.preventDefault(); void action({ action: "test", recipient, expectedRevision: data.settings.revision }); }}>
      <label htmlFor={`${id}-recipient`}>寄送測試信</label>
      <div className="mail-test-row">
        <input id={`${id}-recipient`} type="email" required maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="測試收件地址" aria-describedby={`${id}-feedback ${id}-test-help`} />
        <button className="button" disabled={pending || !enabled} aria-describedby={`${id}-test-help`} aria-busy={pending}>寄送測試信</button>
      </div>
      <p id={`${id}-test-help`} className="field-help">{enabled ? "會實際寄出，並 CC 到網管小組收件地址。" : "儲存並啟用通知後即可寄送；測試信會 CC 到網管小組收件地址。"}</p>
    </form>
    {data.deliveries.length ? <ScrollRegion className="table-wrap" label="寄送紀錄，可水平捲動"><table className="mail-deliveries"><thead><tr><th scope="col">時間</th><th scope="col">收件人／主旨</th><th scope="col">狀態</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead><tbody>{data.deliveries.map(item => <tr key={item.id}>
      <td className="mail-time">{dateLabel(item.createdAt)}</td>
      <td className="mail-message"><strong>{item.recipient}</strong><span>{item.subject}</span></td>
      <td className="mail-status"><span title={item.status === "SENT" ? "Google 已接受，請至收件匣或垃圾郵件匣確認" : undefined}><Badge tone={deliveryTones[item.status] ?? "neutral"}>{deliveryLabels[item.status] || item.status}</Badge></span>{item.attempts > 1 && <small>嘗試 {item.attempts} 次</small>}{item.lastError && <small className="mail-error">{item.lastError}</small>}</td>
      <td className="numeric">{item.status === "FAILED" && <button type="button" className="button compact" disabled={pending || !enabled} onClick={() => void action({ action: "retry", id: item.id })} aria-label={`重新寄送給 ${item.recipient}`}>重新寄送</button>}</td>
    </tr>)}</tbody></table></ScrollRegion> : <p className="workflow-panel-note">尚無寄送紀錄。</p>}
  </section>;
}
