"use client";
import { useId, useRef, useState } from "react";
import { FileText, Inbox, Mail, Plus, RefreshCw, RotateCcw, Send, Settings2, Trash2 } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Badge, LoadingPanel } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { EmailChips, TemplateFields } from "@/components/admin/mail-fields";
import { MailComposePanel, type MailUnit } from "@/components/admin/mail-compose";
import { customSample, customVariables, deliveryLabels, mailSaveSchema, scenarioGroups, scenarioKeys, scenarios, type MailConfig, type PublicMailSettings, type ScenarioKey } from "@/lib/mail/model";

type Delivery = { id: string; eventKey: string; recipient: string; subject: string; status: string; attempts: number; lastError: string | null; createdAt: string; sentAt: string | null };
type Resource = { settings: PublicMailSettings; deliveries: Delivery[]; units?: MailUnit[] };
type Tab = "settings" | "templates" | "compose" | "log";
type TemplateKey = ScenarioKey | `custom:${string}`;
const tabs: { id: Tab; label: string; icon: typeof Mail }[] = [{ id: "settings", label: "通知設定", icon: Settings2 }, { id: "templates", label: "郵件模板", icon: FileText }, { id: "compose", label: "寄信給單位", icon: Send }, { id: "log", label: "寄送紀錄", icon: Inbox }];
const dateLabel = (value: string) => new Date(value).toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false });
const deliveryTones: Record<string, "neutral" | "green" | "orange" | "blue" | "red"> = { PENDING: "neutral", SENDING: "blue", SENT: "green", FAILED: "red" };
const newCustomId = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export function MailSettings() {
  const resource = useResource<Resource>("/api/admin/mail");
  const [tab, setTab] = useState<Tab>("settings");
  const tabsId = useId();
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <LoadingPanel label="載入郵件設定…" />;
  const data = resource.data;
  const editing = tab === "settings" || tab === "templates";
  return <div className="workflow-page">
    <div className="zone-category-tabs tab-strip mail-tabs" role="tablist" aria-label="郵件服務">{tabs.map(({ id, label, icon: Icon }, index) => <button key={id} type="button" role="tab" id={`${tabsId}-tab-${id}`} aria-controls={`${tabsId}-panel`} aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)} onKeyDown={event => {
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length].id;
      setTab(next); document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}><Icon size={15} aria-hidden="true" />{label}</button>)}</div>
    <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${tab}`}>
      {/* The editor stays mounted so unsaved edits survive switching tabs. */}
      <div hidden={!editing}><MailSettingsForm key={data.settings.revision || "initial"} initial={data.settings} view={tab === "templates" ? "templates" : "settings"} onView={setTab} onSaved={resource.reload} /></div>
      {tab === "compose" && <MailComposePanel settings={data.settings} units={data.units ?? []} onSent={resource.reload} onViewLog={() => setTab("log")} />}
      {tab === "log" && <MailDeliveryPanel data={data} reload={resource.reload} />}
    </div>
  </div>;
}

export function MailSettingsForm({ initial, onSaved, view = "settings", onView }: { initial: PublicMailSettings; onSaved: () => Promise<void>; view?: "settings" | "templates"; onView?: (tab: Tab) => void }) {
  const [config, setConfig] = useState<MailConfig>(initial.config);
  const [selected, setSelected] = useState<TemplateKey>("requestCreate");
  const [pending, setPending] = useState(false);
  const saving = useRef(false);
  const [feedback, setFeedbackState] = useState<{ view: string; value: Feedback }>({ view, value: null });
  const setFeedback = (value: Feedback, at: string = view) => setFeedbackState({ view: at, value });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = useId();
  const dirty = JSON.stringify(config) !== JSON.stringify(initial.config);
  const update = <K extends keyof MailConfig>(key: K, value: MailConfig[K]) => setConfig(previous => ({ ...previous, [key]: value }));
  const fieldProps = (key: string) => ({ id: `${id}-${key}`, "aria-invalid": !!errors[key] || undefined, "aria-describedby": [`${id}-feedback`, errors[key] && `${id}-${key}-error`].filter(Boolean).join(" ") });
  const error = (key: string) => errors[key] ? <span id={`${id}-${key}-error`} className="field-error">{errors[key]}</span> : null;
  const recipientError = errors.recipients ?? (Object.keys(errors).some(key => key.startsWith("recipients.")) ? "有地址格式不正確，請移除標紅的地址。" : "");

  async function submit(form: HTMLFormElement) {
    if (saving.current) return;
    const parsed = mailSaveSchema.safeParse({ config, expectedRevision: initial.revision });
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) { const key = issue.path.slice(issue.path[0] === "config" ? 1 : 0).join("."); fields[key] ??= issue.message; }
      const key = Object.keys(fields)[0];
      const [section, item] = key.split(".");
      setErrors(fields); setFeedback({ kind: "error", message: "請修正標示的欄位後再儲存。" }, section === "templates" || section === "customTemplates" ? "templates" : "settings");
      if (section === "templates") { setSelected(item as ScenarioKey); onView?.("templates"); }
      else if (section === "customTemplates") { const custom = config.customTemplates[Number(item)]; if (custom) setSelected(`custom:${custom.id}`); onView?.("templates"); }
      else onView?.("settings");
      const target = section === "recipients" ? "recipients" : key;
      requestAnimationFrame(() => form.querySelector<HTMLElement>(`[id="${id}-${target}"]`)?.focus());
      return;
    }
    saving.current = true; setPending(true); setErrors({}); setFeedback(null);
    try {
      await apiRequest("/api/admin/mail", jsonRequest("PUT", parsed.data));
      setFeedback({ kind: "success", message: "郵件設定已儲存。" });
      await onSaved();
    } catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "儲存失敗" }); }
    finally { saving.current = false; setPending(false); }
  }

  return <form className="card form-surface" noValidate onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
    {view === "settings" ? <header className="workflow-panel-head"><Mail size={20} aria-hidden="true" /><div><h2>通知設定</h2></div><Badge tone={initial.config.enabled ? "green" : "neutral"}>{initial.config.enabled ? "已啟用" : "已停用"}</Badge></header>
      : <header className="workflow-panel-head"><FileText size={20} aria-hidden="true" /><div><h2>郵件模板</h2></div></header>}
    <div className="workflow-feedback" id={`${id}-feedback`}><ActionFeedback feedback={feedback.view === view ? feedback.value : null} /></div>
    {view === "settings" ? <fieldset className="form-fields" disabled={pending}>
      <legend className="sr-only">通知設定</legend>
      <div className="mail-toggle"><input id={`${id}-enabled`} type="checkbox" role="switch" checked={config.enabled} onChange={e => update("enabled", e.target.checked)} aria-describedby={`${id}-enabled-help`} /><label htmlFor={`${id}-enabled`}>啟用郵件服務</label><small id={`${id}-enabled-help`}>停用時不建立新通知並暫停待寄郵件；各場景可在「郵件模板」個別開關。</small></div>
      <div className="mail-relay"><code>smtp-relay.gmail.com</code><span>IP 白名單驗證（免帳密）</span>
        <details><summary>設定需求</summary><p>於 Google 管理控制台允許 VM 公網出口 IP 與寄件網域，並要求 TLS；寄件地址須符合該政策。</p></details>
      </div>
      <div className="mail-grid">
        <label>加密連線<Select aria-label="加密連線" value={config.port} onChange={value => update("port", Number(value) as 465 | 587)} options={[{ value: "587", label: "587 · STARTTLS" }, { value: "465", label: "465 · TLS" }]} /></label>
        <label htmlFor={`${id}-fromName`}>寄件者名稱<input {...fieldProps("fromName")} maxLength={100} value={config.fromName} onChange={e => update("fromName", e.target.value)} />{error("fromName")}</label>
        <label htmlFor={`${id}-fromEmail`}>寄件地址<input {...fieldProps("fromEmail")} type="email" value={config.fromEmail} onChange={e => update("fromEmail", e.target.value)} placeholder="dns@example.edu.tw" />{error("fromEmail")}</label>
      </div>
      <div className="mail-recipients">
        <div className="mail-recipients-head"><label htmlFor={`${id}-recipients`}>網管小組收件地址</label><span className="mail-count">{config.recipients.length} / 20</span></div>
        <EmailChips id={`${id}-recipients`} value={config.recipients} onChange={value => update("recipients", value)} max={20} invalid={!!recipientError} describedBy={`${id}-recipients-help${recipientError ? ` ${id}-recipients-error` : ""}`} placeholder="輸入地址後按 Enter" />
        {recipientError && <span id={`${id}-recipients-error`} className="field-error">{recipientError}</span>}
        <small id={`${id}-recipients-help`} className="field-help">按 Enter 或一次貼上多個地址即可加入。申請通知寄給這些地址，所有郵件的回覆也會寄到這裡。</small>
      </div>
    </fieldset> : <TemplatesEditor id={id} config={config} setConfig={setConfig} selected={selected} setSelected={setSelected} errors={errors} pending={pending} revision={initial.revision} savedEnabled={initial.config.enabled} dirty={dirty} />}
    <div className="mail-form-actions">
      <span className="mail-dirty" role="status">{dirty ? "有尚未儲存的變更" : ""}</span>
      <div className="unit-actions">
        {dirty && <button type="button" className="button ghost" disabled={pending} onClick={() => { setConfig(initial.config); setErrors({}); setFeedback(null); }}><RotateCcw size={15} aria-hidden="true" />捨棄變更</button>}
        <button className="button primary" disabled={pending || !dirty} aria-busy={pending}>{pending ? "儲存中…" : "儲存設定"}</button>
      </div>
    </div>
  </form>;
}

function TemplatesEditor({ id, config, setConfig, selected, setSelected, errors, pending, revision, savedEnabled, dirty }: { id: string; config: MailConfig; setConfig: React.Dispatch<React.SetStateAction<MailConfig>>; selected: TemplateKey; setSelected: (key: TemplateKey) => void; errors: Record<string, string>; pending: boolean; revision: string | null; savedEnabled: boolean; dirty: boolean }) {
  const customIndex = selected.startsWith("custom:") ? config.customTemplates.findIndex(t => `custom:${t.id}` === selected) : -1;
  const custom = customIndex >= 0 ? config.customTemplates[customIndex] : null;
  const scenarioKey: ScenarioKey | null = custom ? null : (scenarioKeys as readonly string[]).includes(selected) ? selected as ScenarioKey : "requestCreate";
  const scenario = scenarioKey ? scenarios[scenarioKey] : null;
  const template = scenarioKey ? config.templates[scenarioKey] : null;
  const savedCustom = custom && revision ? custom : null;
  const hasError = (prefix: string) => Object.keys(errors).some(key => key.startsWith(prefix));
  const setTemplate = (key: ScenarioKey, patch: Partial<MailConfig["templates"][ScenarioKey]>) => setConfig(c => ({ ...c, templates: { ...c.templates, [key]: { ...c.templates[key], ...patch } } }));
  const setCustom = (index: number, patch: Partial<MailConfig["customTemplates"][number]>) => setConfig(c => ({ ...c, customTemplates: c.customTemplates.map((t, i) => i === index ? { ...t, ...patch } : t) }));
  function addCustom() {
    const created = { id: newCustomId(), name: `自訂模板 ${config.customTemplates.length + 1}`, subject: "[DNS Manager] ", body: "{{recipientName}} 您好：\n\n\n\n網管小組" };
    setConfig(c => ({ ...c, customTemplates: [...c.customTemplates, created] }));
    setSelected(`custom:${created.id}`);
  }
  return <div className="mail-templates">
    <nav className="mail-template-nav" aria-label="模板列表">
      {scenarioGroups.map(group => <div key={group.id} className="mail-template-group">
        <p>{group.label}<small>寄給{group.audience}</small></p>
        {scenarioKeys.filter(key => scenarios[key].group === group.id).map(key => <button key={key} type="button" aria-current={selected === key ? "true" : undefined} onClick={() => setSelected(key)} className={hasError(`templates.${key}.`) ? "has-error" : undefined}>
          <span>{scenarios[key].label}</span><span className={config.templates[key].enabled ? "mail-dot is-on" : "mail-dot"}>{config.templates[key].enabled ? "啟用" : "停用"}</span>
        </button>)}
      </div>)}
      <div className="mail-template-group">
        <p>自訂模板<small>寄信給單位時使用</small></p>
        {config.customTemplates.map((t, index) => <button key={t.id} type="button" aria-current={selected === `custom:${t.id}` ? "true" : undefined} onClick={() => setSelected(`custom:${t.id}`)} className={hasError(`customTemplates.${index}.`) ? "has-error" : undefined}><span>{t.name || "未命名模板"}</span></button>)}
        <button type="button" className="mail-template-add" disabled={pending || config.customTemplates.length >= 20} onClick={addCustom}><Plus size={14} aria-hidden="true" />新增自訂模板</button>
      </div>
    </nav>
    <fieldset className="form-fields mail-template-panel" disabled={pending}>
      {scenario && template && scenarioKey ? <>
        <legend className="mail-template-title"><strong>{scenario.label}</strong><small>寄給{scenario.audience}</small></legend>
        <div className="mail-template-options">
          <label className="mail-check"><input type="checkbox" role="switch" checked={template.enabled} onChange={e => setTemplate(scenarioKey, { enabled: e.target.checked })} />啟用此通知</label>
          {scenario.group !== "request" && <label className="mail-check"><input type="checkbox" checked={template.ccTeam} onChange={e => setTemplate(scenarioKey, { ccTeam: e.target.checked })} />副本給網管小組</label>}
          <button type="button" className="button ghost compact" onClick={() => setTemplate(scenarioKey, { subject: scenario.defaults.subject, body: scenario.defaults.body })}><RotateCcw size={14} aria-hidden="true" />還原預設</button>
        </div>
        <TemplateFields id={id} errorKey={`templates.${scenarioKey}`} subject={template.subject} body={template.body} variables={scenario.variables} sample={scenario.sample} errors={errors} onChange={patch => setTemplate(scenarioKey, patch)} />
      </> : custom ? <>
        <legend className="mail-template-title"><strong>{custom.name || "未命名模板"}</strong><small>自訂模板</small></legend>
        <div className="mail-template-options">
          <label htmlFor={`${id}-customTemplates.${customIndex}.name`} className="mail-inline-label">模板名稱<input id={`${id}-customTemplates.${customIndex}.name`} maxLength={60} value={custom.name} onChange={e => setCustom(customIndex, { name: e.target.value })} aria-invalid={!!errors[`customTemplates.${customIndex}.name`] || undefined} /></label>
          <button type="button" className="button ghost compact danger-hover" onClick={() => { setConfig(c => ({ ...c, customTemplates: c.customTemplates.filter(t => t.id !== custom.id) })); setSelected("requestCreate"); }}><Trash2 size={14} aria-hidden="true" />刪除模板</button>
        </div>
        {errors[`customTemplates.${customIndex}.name`] && <span className="field-error">{errors[`customTemplates.${customIndex}.name`]}</span>}
        <TemplateFields id={id} errorKey={`customTemplates.${customIndex}`} subject={custom.subject} body={custom.body} variables={customVariables} sample={customSample} errors={errors} onChange={patch => setCustom(customIndex, patch)} />
      </> : null}
      <MailTestSend template={savedCustom ? `custom:${savedCustom.id}` : scenarioKey ?? "requestCreate"} revision={revision} enabled={savedEnabled} dirty={dirty} />
    </fieldset>
  </div>;
}

/** Sends the saved version of a template with sample values; the test is copied to the network team. */
export function MailTestSend({ template, revision, enabled, dirty }: { template: string; revision: string | null; enabled: boolean; dirty: boolean }) {
  const [recipient, setRecipient] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const id = useId();
  const blocked = !enabled || dirty || !revision;
  async function send() {
    if (pending || blocked || !recipient) return;
    setPending(true); setFeedback(null);
    try { await apiRequest("/api/admin/mail", jsonRequest("POST", { action: "test", recipient, template, expectedRevision: revision })); setFeedback({ kind: "success", message: "測試信已排入寄送，可在「寄送紀錄」查看結果。" }); }
    catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "操作失敗" }); }
    finally { setPending(false); }
  }
  return <div className="mail-test">
    <label htmlFor={`${id}-recipient`}>寄送測試信</label>
    <div className="mail-test-row">
      <input id={`${id}-recipient`} type="email" maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); void send(); } }} placeholder="測試收件地址" aria-describedby={`${id}-help`} />
      <button type="button" className="button" disabled={pending || blocked || !recipient} aria-describedby={`${id}-help`} aria-busy={pending} onClick={() => void send()}>寄送測試信</button>
    </div>
    <p id={`${id}-help`} className="field-help">{!enabled || !revision ? "儲存並啟用郵件服務後即可寄送；測試信會 CC 到網管小組收件地址。" : dirty ? "請先儲存變更；測試信使用已儲存的模板。" : "以範例資料寄出已儲存的模板，並 CC 到網管小組收件地址。"}</p>
    <ActionFeedback feedback={feedback} />
  </div>;
}

export function MailDeliveryPanel({ data, reload }: { data: Resource; reload: () => Promise<void> }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const enabled = data.settings.config.enabled;
  async function retry(id: string) {
    if (busy.current) return;
    busy.current = true; setPending(true); setFeedback(null);
    try { await apiRequest("/api/admin/mail", jsonRequest("POST", { action: "retry", id })); setFeedback({ kind: "success", message: "已重新排入寄送。" }); await reload(); }
    catch (e) { setFeedback({ kind: "error", message: e instanceof Error ? e.message : "操作失敗" }); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className="card table-card">
    <header className="workflow-panel-head"><Inbox size={20} aria-hidden="true" /><div><h2>寄送紀錄</h2><p>最近 30 筆 · 台北時間</p></div><button type="button" className="icon-button" disabled={pending} onClick={() => void reload()} aria-label="重新整理寄送紀錄" title="重新整理"><RefreshCw size={16} aria-hidden="true" /></button></header>
    <div className="workflow-feedback"><ActionFeedback feedback={feedback} /></div>
    {data.deliveries.length ? <ScrollRegion className="table-wrap" label="寄送紀錄，可水平捲動"><table className="mail-deliveries"><thead><tr><th scope="col">時間</th><th scope="col">收件人／主旨</th><th scope="col">狀態</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead><tbody>{data.deliveries.map(item => <tr key={item.id}>
      <td className="mail-time">{dateLabel(item.createdAt)}</td>
      <td className="mail-message"><strong>{item.recipient}</strong><span>{item.subject}</span></td>
      <td className="mail-status"><span title={item.status === "SENT" ? "Google 已接受，請至收件匣或垃圾郵件匣確認" : undefined}><Badge tone={deliveryTones[item.status] ?? "neutral"}>{deliveryLabels[item.status] || item.status}</Badge></span>{item.attempts > 1 && <small>嘗試 {item.attempts} 次</small>}{item.lastError && <small className="mail-error">{item.lastError}</small>}</td>
      <td className="numeric">{item.status === "FAILED" && <button type="button" className="button compact" disabled={pending || !enabled} onClick={() => void retry(item.id)} aria-label={`重新寄送給 ${item.recipient}`}>重新寄送</button>}</td>
    </tr>)}</tbody></table></ScrollRegion> : <p className="workflow-panel-note">尚無寄送紀錄。</p>}
  </section>;
}
