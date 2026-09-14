"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Copy, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { useResource } from "@/lib/client/use-resource";
import { canSubmitUnitRequest, unitRoleLabels, type UnitRole } from "@/lib/units/policy";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, SubmitButton } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";

type Unit = { id: string; name: string; role: UnitRole; memberCount: number };
type UnitRecord = { id: string; zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; purpose: string; expectedHash: string };
type Member = { userId: string; label: string; role: UnitRole; disabled: boolean };
type Detail = { unit: { id: string; name: string }; role: UnitRole; members: Member[]; records: UnitRecord[]; recordsError: string };

export function UnitsWorkbench() {
  const { data, loading, error, reload } = useResource<{ units: Unit[] }>("/api/units");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [invitation, setInvitation] = useState<{ name: string; passcode: string } | null>(null);
  const units = data?.units ?? [];
  const active = units.find((unit) => unit.id === selected) ?? units[0];
  return <>
    <div className="unit-toolbar"><p>查看成員可共用 DNS；編輯與管理成員可送出申請，均須系統管理員審核。</p><div className="unit-actions"><button className="button" onClick={() => setMode("join")}>使用 passcode 加入</button><button className="button primary" onClick={() => setMode("create")}><Plus size={16} />建立單位</button><button className="button" disabled={loading} onClick={() => void reload()} aria-label="重新載入單位"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></div></div>
    {loading && <p role="status">正在載入單位…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && !units.length && <div className="card"><EmptyState title="尚未加入單位" description="建立你的實驗室或工作單位，或向單位管理員索取 passcode。加入後預設為查看角色。" /></div>}
    {!loading && !error && active && <div className="unit-layout"><nav className="card unit-selector" aria-label="我的單位">{units.map((unit) => <button key={unit.id} type="button" aria-current={active.id === unit.id ? "true" : undefined} onClick={() => setSelected(unit.id)}><Building2 size={18} /><span><strong>{unit.name}</strong><small>{unitRoleLabels[unit.role]} · {unit.memberCount} 位成員</small></span></button>)}</nav><UnitDetail key={active.id} id={active.id} onMembershipChanged={reload} onPasscode={(passcode) => setInvitation({ name: active.name, passcode })} /></div>}
    {mode && <UnitEntryDialog mode={mode} onClose={() => setMode(null)} onSaved={async (result) => { setMode(null); setSelected(result.unit.id); if (result.passcode) setInvitation({ name: result.unit.name, passcode: result.passcode }); else toast.success("已加入單位，預設可查看 DNS"); await reload(); }} />}
    {invitation && <Dialog title={`${invitation.name} · 加入碼`} description="此 passcode 只顯示這一次，請安全保存並私下提供給成員。日後可重設，舊碼會立即失效。" onClose={() => setInvitation(null)}><div className="modal-body unit-passcode"><code>{invitation.passcode}</code><button type="button" className="button" onClick={async () => { try { await navigator.clipboard.writeText(invitation.passcode); toast.success("已複製加入碼"); } catch { toast.error("無法自動複製，請手動選取加入碼"); } }}><Copy size={16} />複製加入碼</button></div><div className="modal-foot"><button className="button primary" onClick={() => setInvitation(null)}>完成</button></div></Dialog>}
  </>;
}

function UnitEntryDialog({ mode, onClose, onSaved }: { mode: "create" | "join"; onClose: () => void; onSaved: (result: { unit: { id: string; name: string }; passcode?: string }) => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title={mode === "create" ? "建立單位" : "加入單位"} description={mode === "create" ? "建立者成為單位管理員，可管理成員及發送加入碼。" : "請輸入單位管理員提供的專屬 passcode；加入後不會自動取得編輯權限。"} pending={pending} onClose={onClose}><form onSubmit={async (event) => {
    event.preventDefault(); if (sending.current) return;
    const form = new FormData(event.currentTarget); sending.current = true; setPending(true); setError("");
    try { const result = await apiRequest<{ unit: { id: string; name: string }; passcode?: string }>("/api/units", jsonRequest("POST", mode === "create" ? { action: mode, name: form.get("name") } : { action: mode, passcode: form.get("passcode") })); await onSaved(result); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "操作失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{mode === "create" ? <label>單位名稱<input name="name" required maxLength={100} placeholder="例如：網路系統實驗室" /></label> : <label>專屬 passcode<input name="passcode" type="password" required autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={100} /></label>}{error && <p ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}</div><div className="modal-foot"><button type="button" className="button" onClick={onClose}>取消</button><SubmitButton pending={pending} label={mode === "create" ? "建立並取得加入碼" : "加入單位"} /></div></fieldset></form></Dialog>;
}

function UnitDetail({ id, onMembershipChanged, onPasscode }: { id: string; onMembershipChanged: () => Promise<void>; onPasscode: (code: string) => void }) {
  const { data, loading, error, reload } = useResource<Detail>(`/api/units/${encodeURIComponent(id)}`);
  const [query, setQuery] = useState("");
  const [change, setChange] = useState<UnitRecord | null>(null);
  const [manage, setManage] = useState<Member | "rotate" | null>(null);
  if (loading) return <section className="card unit-panel"><p role="status">正在載入單位 DNS 與成員…</p></section>;
  if (error || !data) return <section className="card unit-panel"><p className="form-error" role="alert">{error || "找不到單位"}</p><button className="button" onClick={() => void reload()}>重新載入</button></section>;
  const records = data.records.filter((record) => [record.recordName, record.recordType, record.content, record.purpose].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="unit-detail"><div className="card unit-panel"><div className="unit-heading"><div><h2>{data.unit.name}</h2><p>{unitRoleLabels[data.role]} · {data.records.length} 筆目前有效的 DNS</p></div><div className="unit-actions">{canSubmitUnitRequest(data.role) && <Link className="button primary" href="/requests/new">申請單位 DNS</Link>}<Link className="button" href="/requests">查看申請進度</Link><button className="button" aria-label="重新載入 DNS" onClick={() => void reload()}><RefreshCw size={16} /></button></div></div><label className="unit-search">搜尋 DNS<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、類型、解析內容、用途" /></label>
    <ScrollRegion label="單位 DNS 紀錄" className="unit-record-scroll"><table className="unit-table"><thead><tr><th scope="col">名稱／類型</th><th scope="col">解析內容</th><th scope="col">用途</th><th scope="col">操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.recordName}</strong><small>{record.recordType} · TTL {record.ttl}s{record.disabled ? " · 已停用" : ""}</small></td><td><code>{record.content}</code></td><td>{record.purpose || "—"}</td><td>{canSubmitUnitRequest(data.role) && ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(record.recordType) ? <button className="button" onClick={() => setChange(record)}>申請變更</button> : "僅供查看"}</td></tr>)}</tbody></table></ScrollRegion>
    {data.recordsError && <p className="form-error" role="alert">{data.recordsError}</p>}
    {!records.length && !data.recordsError && <EmptyState title={query ? "沒有符合條件的 DNS" : "尚無單位 DNS"} description={query ? "請調整搜尋條件。" : "申請時選擇共享單位，經系統管理員核准後會出現在此處。舊的文字單位欄位不會自動授予共享權限。"} />}</div>
    <div className="card unit-panel"><div className="unit-heading"><h2><Users size={18} />單位成員</h2>{data.role === "ADMIN" && <button className="button" onClick={() => setManage("rotate")}>重設 passcode</button>}</div><p className="description">查看：讀取 DNS。編輯：送出申請。單位管理：另可管理成員；不具備 DNS 審核權。</p><ul className="unit-members">{data.members.map((member) => <li key={member.userId}><span><strong>{member.label}</strong><small>{unitRoleLabels[member.role]}{member.disabled ? " · 帳號已停用" : ""}</small></span>{data.role === "ADMIN" && <button className="button" onClick={() => setManage(member)}>管理</button>}</li>)}</ul></div>
    {change && <ChangeDialog unitId={id} record={change} onClose={() => setChange(null)} onSaved={async () => { setChange(null); toast.success("變更申請已送出，核准前不會修改 DNS"); await reload(); }} />}
    {manage && <ManageDialog unitId={id} target={manage} onClose={() => setManage(null)} onSaved={async (code) => { setManage(null); if (code) onPasscode(code); else toast.success("成員設定已更新"); await onMembershipChanged(); await reload(); }} />}
  </section>;
}

function ChangeDialog({ unitId, record, onClose, onSaved }: { unitId: string; record: UnitRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  return <ActionDialog title="申請變更 DNS" description="只變更這一筆解析內容；名稱、類型與共用 TTL 維持不變。須系統管理員審核後才會生效。" onClose={onClose} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}/changes`, jsonRequest("POST", { recordId: record.id, content: form.get("content"), purpose: form.get("purpose"), expectedHash: record.expectedHash })); await onSaved(); }} label="送出變更申請"><p><strong>{record.recordName}</strong> · {record.recordType}</p><p>原解析內容：<code className="unit-wrap">{record.content}</code></p><label>新解析內容<textarea name="content" defaultValue={record.content} required maxLength={65535} rows={3} spellCheck={false} autoCapitalize="none" /></label><label>變更原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>;
}
function ManageDialog({ unitId, target, onClose, onSaved }: { unitId: string; target: Member | "rotate"; onClose: () => void; onSaved: (code?: string) => Promise<void> }) {
  return <ActionDialog title={target === "rotate" ? "重設單位 passcode？" : `管理成員 · ${target.label}`} description={target === "rotate" ? "舊加入碼會立即失效，不影響既有成員。新碼只顯示一次。" : "至少需保留一位可登入的單位管理員。移除成員會同時作廢舊加入碼，之後請重設並發送新碼。"} onClose={onClose} label="確認更新" submit={async (form) => { const role = form.get("role"); const result = await apiRequest<{ passcode?: string }>(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", target === "rotate" ? { action: "rotate" } : { action: "member", userId: target.userId, role: role === "REMOVE" ? null : role })); await onSaved(result.passcode); }}>{target !== "rotate" && <label>成員角色<select name="role" defaultValue={target.role}>{Object.entries(unitRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}<option value="REMOVE">移出單位</option></select></label>}</ActionDialog>;
}
function ActionDialog({ title, description, children, label, submit, onClose }: { title: string; description: string; children?: React.ReactNode; label: string; submit: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [pending, setPending] = useState(false); const sending = useRef(false);
  const [error, setError] = useState(""); const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title={title} description={description} pending={pending} onClose={onClose}><form onSubmit={async (event) => { event.preventDefault(); if (sending.current) return; const form = new FormData(event.currentTarget); sending.current = true; setPending(true); setError(""); try { await submit(form); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成，請重試。"); } finally { sending.current = false; setPending(false); } }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{children}{error && <p className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}</div><div className="modal-foot"><button className="button" type="button" onClick={onClose}>取消</button><SubmitButton pending={pending} label={label} /></div></fieldset></form></Dialog>;
}
