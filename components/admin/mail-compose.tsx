"use client";
import { useId, useMemo, useRef, useState } from "react";
import { Search, Send, X } from "lucide-react";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { TemplateFields } from "@/components/admin/mail-fields";
import { customSample, customVariables, manualMessageSchema, type PublicMailSettings } from "@/lib/mail/model";

export type MailUnit = { id: string; name: string; admins: { name: string; email: string | null }[] };
const reachable = (unit: MailUnit) => unit.admins.filter(admin => admin.email).length;

export function MailComposePanel({ settings, units, onSent, onViewLog }: { settings: PublicMailSettings; units: MailUnit[]; onSent: () => Promise<void>; onViewLog: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [templateId, setTemplateId] = useState("");
  const [message, setMessage] = useState({ subject: "", body: "" });
  const [ccTeam, setCcTeam] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const id = useId();
  const enabled = settings.config.enabled;
  const visible = useMemo(() => { const needle = query.trim().toLowerCase(); return units.filter(unit => !needle || unit.name.toLowerCase().includes(needle)); }, [units, query]);
  const chosen = units.filter(unit => selected.has(unit.id));
  const recipientCount = chosen.reduce((sum, unit) => sum + reachable(unit), 0);
  const selectable = visible.filter(reachable);
  const allVisibleSelected = selectable.length > 0 && selectable.every(unit => selected.has(unit.id));
  const sample = chosen[0] ? { ...customSample, unitName: chosen[0].name, recipientName: chosen[0].admins.find(a => a.email)?.name || customSample.recipientName } : customSample;
  const toggle = (unitId: string) => setSelected(current => { const next = new Set(current); if (next.has(unitId)) next.delete(unitId); else next.add(unitId); return next; });

  function review() {
    const parsed = manualMessageSchema.safeParse(message);
    const fields: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) fields[`message.${issue.path.join(".")}`] ??= issue.message;
    if (!recipientCount) fields.units = "請選擇至少一個有管理員信箱的單位";
    setErrors(fields);
    if (Object.keys(fields).length) { setFeedback({ kind: "error", message: "請修正標示的欄位。" }); return; }
    setFeedback(null); setConfirming(true);
  }
  async function send() {
    if (sending.current) return;
    sending.current = true; setPending(true);
    try {
      const result = await apiRequest<{ queued: number }>("/api/admin/mail", jsonRequest("POST", { action: "send", unitIds: [...selected], subject: message.subject, body: message.body, ccTeam }));
      setConfirming(false); setSelected(new Set());
      setFeedback({ kind: "success", message: `已排入 ${result.queued} 封郵件，可在「寄送紀錄」查看結果。` });
      await onSent();
    } catch (e) { setConfirming(false); setFeedback({ kind: "error", message: e instanceof Error ? e.message : "寄送失敗" }); }
    finally { sending.current = false; setPending(false); }
  }

  return <section className="card form-surface">
    <header className="workflow-panel-head"><Send size={20} aria-hidden="true" /><div><h2>寄信給單位</h2><p>寄給所選單位的管理員，回覆會寄到網管小組</p></div></header>
    <div className="workflow-feedback"><ActionFeedback feedback={feedback} />{feedback?.kind === "success" && <button type="button" className="link-button mail-log-link" onClick={onViewLog}>查看寄送紀錄</button>}</div>
    {!enabled && <p className="workflow-panel-note">郵件服務尚未啟用，請先至「通知設定」啟用並儲存。</p>}
    <fieldset className="form-fields" disabled={pending || !enabled}>
      <legend className="sr-only">寄信給單位</legend>
      <div className="mail-units">
        <div className="mail-recipients-head"><span id={`${id}-units-label`} className="mail-field-label">收件單位</span><span className="mail-count">已選 {chosen.length} 個單位 · {recipientCount} 位管理員</span></div>
        <div className="mail-unit-tools">
          <div className="filter-input"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜尋單位" aria-label="搜尋單位" />{query && <button type="button" className="search-clear" aria-label="清除搜尋" onClick={() => setQuery("")}><X size={15} /></button>}</div>
          <button type="button" className="button compact" disabled={!selectable.length} onClick={() => setSelected(current => { const next = new Set(current); for (const unit of selectable) { if (allVisibleSelected) next.delete(unit.id); else next.add(unit.id); } return next; })}>{allVisibleSelected ? "取消全選" : query ? "全選搜尋結果" : "全選"}</button>
          {selected.size > 0 && <button type="button" className="button ghost compact" onClick={() => setSelected(new Set())}>清除</button>}
        </div>
        <ul className={`mail-unit-list${errors.units ? " is-invalid" : ""}`} role="group" aria-labelledby={`${id}-units-label`} aria-describedby={errors.units ? `${id}-units-error` : undefined}>
          {visible.map(unit => { const count = reachable(unit); return <li key={unit.id} className={count ? undefined : "is-disabled"}>
            <input id={`${id}-unit-${unit.id}`} type="checkbox" checked={selected.has(unit.id)} disabled={!count} onChange={() => toggle(unit.id)} aria-describedby={`${id}-unit-${unit.id}-admins`} />
            <label htmlFor={`${id}-unit-${unit.id}`}>{unit.name}</label>
            <small id={`${id}-unit-${unit.id}-admins`}>{count ? unit.admins.filter(a => a.email).map(a => a.name || a.email).join("、") : unit.admins.length ? "管理員未提供信箱" : "尚無管理員"}</small>
          </li>; })}
          {!visible.length && <li className="mail-unit-empty">{units.length ? "沒有符合的單位" : "目前沒有已啟用的單位"}</li>}
        </ul>
        {errors.units && <span id={`${id}-units-error`} className="field-error">{errors.units}</span>}
      </div>
      <div className="mail-compose-options">
        <label className="mail-inline-label">套用模板<Select aria-label="套用模板" value={templateId} onChange={value => { setTemplateId(value); const template = settings.config.customTemplates.find(t => t.id === value); if (template) setMessage({ subject: template.subject, body: template.body }); }} options={[{ value: "", label: settings.config.customTemplates.length ? "選擇自訂模板" : "尚無自訂模板", disabled: true }, ...settings.config.customTemplates.map(t => ({ value: t.id, label: t.name }))]} /></label>
        <label className="mail-check"><input type="checkbox" checked={ccTeam} onChange={e => setCcTeam(e.target.checked)} />副本給網管小組</label>
      </div>
      <TemplateFields id={id} errorKey="message" subject={message.subject} body={message.body} variables={customVariables} sample={sample} errors={errors} onChange={patch => setMessage(current => ({ ...current, ...patch }))} />
    </fieldset>
    <div className="mail-form-actions">
      <span className="mail-dirty">{recipientCount ? `將寄出 ${recipientCount} 封` : ""}</span>
      <button type="button" className="button primary" disabled={pending || !enabled} onClick={review}><Send size={15} aria-hidden="true" />寄出</button>
    </div>
    {confirming && <Dialog title="確認寄出郵件？" description={`將寄給 ${chosen.length} 個單位的 ${recipientCount} 位管理員${ccTeam ? "，並副本給網管小組" : ""}。寄出後無法收回。`} pending={pending} onClose={() => setConfirming(false)}>
      <div className="modal-body"><p className="mail-confirm-subject"><strong>{message.subject}</strong></p><p className="field-help">{chosen.map(unit => unit.name).join("、")}</p></div>
      <div className="modal-foot"><button type="button" className="button" disabled={pending} onClick={() => setConfirming(false)}>取消</button><button type="button" className="button primary" disabled={pending} aria-busy={pending} data-dialog-initial-focus onClick={() => void send()}>{pending ? "寄送中…" : `寄出 ${recipientCount} 封`}</button></div>
    </Dialog>}
  </section>;
}
