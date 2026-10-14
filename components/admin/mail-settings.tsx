"use client";
import { useId, useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { defaultBody, defaultSubject, deliveryLabels, mailSaveSchema, renderMail, sampleMailVariables, templateVariables, type MailConfig, type PublicMailSettings } from "@/lib/mail/model";

type Delivery = { id: string; eventKey: string; recipient: string; subject: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };
type Resource = { settings: PublicMailSettings; deliveries: Delivery[] };
const dateLabel = (value: string) => new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
export function MailSettings() {
  const resource = useResource<Resource>("/api/admin/mail");
  const [saved, setSaved] = useState(false);
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">載入郵件設定…</p>;
  return <>
    {saved && <p role="status">郵件設定已儲存。</p>}
    <MailSettingsForm key={resource.data.settings.revision || "initial"} initial={resource.data.settings} onSaved={async () => { setSaved(true); await resource.reload(); }} />
    <MailDeliveryPanel data={resource.data} reload={resource.reload} />
  </>;
}
export function MailSettingsForm({ initial, onSaved }: { initial: PublicMailSettings; onSaved: () => Promise<void> }) {
  const [config, setConfig] = useState(initial.config);
  const [recipients, setRecipients] = useState(initial.config.recipients.join("\n"));
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = useId();
  const update = <K extends keyof MailConfig>(key: K, value: MailConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
  const props = (key: string) => ({ id: `${id}-${key}`, "aria-invalid": !!errors[key] || undefined, "aria-describedby": `${id}-feedback${errors[key] ? ` ${id}-${key}-error` : ""}` });
  const error = (key: string) => errors[key] ? <span id={`${id}-${key}-error`} className="danger">{errors[key]}</span> : null;
  const preview = renderMail(config, sampleMailVariables);
  return <section className="card">
    <header className="workflow-panel-head"><div><h2>Google SMTP 設定</h2><p>目前儲存狀態：{initial.config.enabled ? "通知已啟用" : "通知已停用"}。修改後請儲存。</p></div></header>
    <p className="workflow-panel-note">Workspace relay 可使用來源 IP 白名單，無須綁定 Google 帳號。請先在 Google 管理控制台允許 VM 的公網出口 IP、寄件網域並要求 TLS；寄件地址須符合該政策。</p>
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
        <legend>連線與通知對象</legend>
        <label><input type="checkbox" checked={config.enabled} onChange={e => update("enabled", e.target.checked)} /> 啟用新 DNS 申請郵件通知</label>
        <p>涵蓋新增、修改與刪除申請。停用期間的新申請不補寄；既有待寄郵件暫停，重新啟用後繼續。已開始寄送的郵件可能完成。</p>
        <p>伺服器透過 smtp-relay.gmail.com 寄送，使用 IP 白名單驗證（免帳密）。</p>
        <label htmlFor={`${id}-port`}>加密連線</label><select {...props("port")} value={config.port} onChange={e => update("port", Number(e.target.value) as 465 | 587)}><option value={465}>465 — TLS</option><option value={587}>587 — STARTTLS（強制加密）</option></select>{error("port")}
        <label htmlFor={`${id}-fromName`}>寄件者名稱</label><input {...props("fromName")} maxLength={100} value={config.fromName} onChange={e => update("fromName", e.target.value)} />{error("fromName")}
        <label htmlFor={`${id}-fromEmail`}>寄件地址</label><input {...props("fromEmail")} type="email" required={config.enabled} value={config.fromEmail} onChange={e => update("fromEmail", e.target.value)} />{error("fromEmail")}
        <label htmlFor={`${id}-recipients`}>網管小組收件地址（最多 20 個，每行一個或以逗號分隔）</label><textarea {...props("recipients")} required={config.enabled} rows={3} maxLength={5200} value={recipients} onChange={e => setRecipients(e.target.value)} />{error("recipients")}
      </fieldset>
      <fieldset className="form-fields" disabled={pending}>
        <legend>新 DNS 申請模板</legend>
        <p id={`${id}-variables`}>可用變數：{templateVariables.map(v => `{{${v}}}`).join("、")}。內文使用純文字，不執行 HTML 或程式碼。</p>
        <label htmlFor={`${id}-subject`}>郵件主旨</label><input {...props("subject")} required maxLength={300} value={config.subject} onChange={e => update("subject", e.target.value)} />{error("subject")}
        <label htmlFor={`${id}-body`}>郵件內文</label><textarea {...props("body")} required rows={12} maxLength={20000} value={config.body} onChange={e => update("body", e.target.value)} />{error("body")}
        <div className="form-actions"><button type="button" className="button" onClick={() => setConfig(v => ({ ...v, subject: defaultSubject, body: defaultBody }))}>還原預設模板</button></div>
        <details><summary>預覽模板（範例資料，不會寄信）</summary><h3>{preview.subject}</h3><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>{preview.text}</pre></details>
        <p>每份申請對每個收件地址寄送一封。已排入待辦的寄件地址、收件地址及內容不隨模板變更；SMTP 連線使用最新設定。</p>
        <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "儲存中…" : "儲存郵件設定"}</button></div>
      </fieldset>
    </form>
  </section>;
}
function MailDeliveryPanel({ data, reload }: { data: Resource; reload: () => Promise<void> }) {
  const [recipient, setRecipient] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const id = useId();
  async function action(input: unknown) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try { await apiRequest("/api/admin/mail", jsonRequest("POST", input)); setFeedback({ kind: "success", message: "已排入寄送待辦，請稍後更新寄送紀錄。" }); await reload(); }
    catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "操作失敗" }); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="card">
    <header className="workflow-panel-head"><div><h2>測試與寄送紀錄</h2><p>使用已儲存的設定；測試信只寄給下方指定地址。</p></div><button type="button" className="button" disabled={pending} onClick={() => void reload()}>更新紀錄與設定</button></header>
    <div className="workflow-feedback" id={`${id}-feedback`}><ActionFeedback feedback={feedback} /></div>
    <form className="form-surface" onSubmit={e => { e.preventDefault(); void action({ action: "test", recipient, expectedRevision: data.settings.revision }); }}>
      <fieldset className="form-fields" disabled={pending || !data.settings.config.enabled}>
        <legend>寄送測試信</legend>
        <label htmlFor={`${id}-recipient`}>測試收件地址</label><input id={`${id}-recipient`} type="email" required maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)} aria-describedby={`${id}-feedback ${id}-test-help`} />
        <p id={`${id}-test-help`}>先儲存並啟用設定，再填寫測試地址；按下按鈕後會實際寄信。</p>
        <div className="form-actions"><button className="button" aria-busy={pending}>寄送測試信</button></div>
      </fieldset>
    </form>
    <p className="workflow-panel-note">最近 30 筆（台北時間）。「SMTP 已接受」表示 Google 接受郵件，仍須確認收件匣與垃圾郵件匣。失敗最多自動嘗試 5 次；中斷重試可能重複寄送。</p>
    {data.deliveries.length ? <div className="table-wrap"><table><thead><tr><th scope="col">建立時間</th><th scope="col">收件人／主旨</th><th scope="col">狀態</th><th scope="col">嘗試次數</th><th scope="col">處理</th></tr></thead><tbody>{data.deliveries.map(item => <tr key={item.id}>
      <td>{dateLabel(item.createdAt)}</td><td><div>{item.recipient}</div><div>{item.subject}</div></td><td>{deliveryLabels[item.status] || item.status}{item.lastError && <p>{item.lastError}</p>}</td><td>{item.attempts}</td><td>{item.status === "FAILED" ? <button type="button" className="button" disabled={pending || !data.settings.config.enabled} onClick={() => void action({ action: "retry", id: item.id })} aria-label={`重新寄送給 ${item.recipient}`}>重新寄送</button> : "—"}</td>
    </tr>)}</tbody></table></div> : <p className="workflow-panel-note">尚無寄送紀錄。</p>}
  </section>;
}
