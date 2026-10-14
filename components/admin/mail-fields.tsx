"use client";
import { useRef, useState } from "react";
import { X } from "lucide-react";
import { renderMail } from "@/lib/mail/model";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (value: string) => emailPattern.test(value);

/** Each address becomes a chip on Enter, comma, space, paste or blur; Backspace removes the last one. */
export function EmailChips({ id, value, onChange, max, describedBy, invalid, placeholder }: { id: string; value: string[]; onChange: (next: string[]) => void; max: number; describedBy?: string; invalid?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function commit(text: string) {
    const known = new Set(value.map(v => v.toLowerCase()));
    const added: string[] = [];
    for (const address of text.split(/[\s,;，；、]+/).map(v => v.trim())) {
      if (!address || known.has(address.toLowerCase())) continue;
      known.add(address.toLowerCase());
      added.push(address);
    }
    if (added.length) onChange([...value, ...added].slice(0, max));
    setDraft("");
  }
  const full = value.length >= max;
  return <div className={`chip-input${invalid ? " is-invalid" : ""}`}>
    <ul aria-label="已加入的地址">{value.map(address => <li key={address} className={isEmail(address) ? "chip" : "chip is-invalid"} title={isEmail(address) ? undefined : "地址格式不正確"}>
      <span>{address}</span><button type="button" onClick={() => { onChange(value.filter(v => v !== address)); input.current?.focus(); }} aria-label={`移除 ${address}`}><X size={12} aria-hidden="true" /></button>
    </li>)}</ul>
    <input ref={input} id={id} type="text" inputMode="email" autoComplete="off" spellCheck={false} value={draft} disabled={full} placeholder={full ? `已達上限 ${max} 個` : value.length ? "" : placeholder} aria-describedby={describedBy} aria-invalid={invalid || undefined}
      onChange={event => /[\s,;，；、]/.test(event.target.value) ? commit(event.target.value) : setDraft(event.target.value)}
      onKeyDown={event => {
        if ((event.key === "Enter" || event.key === "Tab") && draft.trim()) { event.preventDefault(); commit(draft); }
        else if (event.key === "Enter") event.preventDefault();
        else if (event.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
      }}
      onPaste={event => { event.preventDefault(); commit(draft + event.clipboardData.getData("text")); }}
      onBlur={() => draft.trim() && commit(draft)} />
  </div>;
}

/** Subject, body, insertable variables and a live preview rendered with sample values. */
export function TemplateFields({ id, subject, body, variables, sample, onChange, errors = {}, errorKey, describedBy }: { id: string; subject: string; body: string; variables: readonly string[]; sample: Record<string, string>; onChange: (next: { subject?: string; body?: string }) => void; errors?: Record<string, string>; errorKey: string; describedBy?: string }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const preview = renderMail({ subject, body }, sample);
  const error = (key: string) => errors[`${errorKey}.${key}`];
  const aria = (key: string, extra?: string) => ({ id: `${id}-${errorKey}.${key}`, "aria-invalid": !!error(key) || undefined, "aria-describedby": [describedBy, extra, error(key) && `${id}-${errorKey}.${key}-error`].filter(Boolean).join(" ") || undefined });
  function insert(name: string) {
    const token = `{{${name}}}`;
    const start = field.current?.selectionStart ?? body.length;
    const end = field.current?.selectionEnd ?? start;
    onChange({ body: body.slice(0, start) + token + body.slice(end) });
    requestAnimationFrame(() => { field.current?.focus(); field.current?.setSelectionRange(start + token.length, start + token.length); });
  }
  return <>
    <label htmlFor={`${id}-${errorKey}.subject`}>主旨<input {...aria("subject")} required maxLength={300} value={subject} onChange={e => onChange({ subject: e.target.value })} />{error("subject") && <span id={`${id}-${errorKey}.subject-error`} className="field-error">{error("subject")}</span>}</label>
    <div className="mail-template-grid">
      <div className="mail-template-editor">
        <label htmlFor={`${id}-${errorKey}.body`}>內文<textarea ref={field} {...aria("body", `${id}-${errorKey}-variables`)} required rows={12} maxLength={20000} value={body} onChange={e => onChange({ body: e.target.value })} />{error("body") && <span id={`${id}-${errorKey}.body-error`} className="field-error">{error("body")}</span>}</label>
        <div className="mail-variables" id={`${id}-${errorKey}-variables`} role="group" aria-label="點選插入變數">{variables.map(v => <button type="button" key={v} onClick={() => insert(v)} aria-label={`插入變數 ${v}`}>{`{{${v}}}`}</button>)}</div>
      </div>
      <figure className="mail-preview" aria-label="郵件預覽">
        <figcaption>預覽<small>範例資料</small></figcaption>
        <strong>{preview.subject || "（無主旨）"}</strong>
        <pre>{preview.text}</pre>
      </figure>
    </div>
  </>;
}
