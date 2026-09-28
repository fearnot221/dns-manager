"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Building2, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { useResource } from "@/lib/client/use-resource";
import { unitRoleLabels, type UnitRole } from "@/lib/units/policy";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, SubmitButton } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select } from "@/components/ui/select";

type UnitStatus = "PENDING" | "APPROVED" | "REJECTED";
const statusLabels = { PENDING: "待系統管理員審核", APPROVED: "已核准", REJECTED: "已退回" };
type Unit = { status: UnitStatus; id: string; name: string; role: UnitRole; memberCount: number };
type UnitRecord = { id: string; zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; purpose: string; expectedHash: string };
type Member = { userId: string; label: string; studentId?: string | null; role: UnitRole; disabled: boolean };
type Detail = { allowlist: { studentId: string; userId: string | null }[]; unit: { id: string; name: string; status: UnitStatus; reviewNote: string | null }; canReview: boolean; canApply: boolean; role: UnitRole; members: Member[]; records: UnitRecord[]; recordsError: string };

export function UnitsWorkbench({ systemAdmin }: { systemAdmin: boolean }) {
  const { data, loading, error, reload } = useResource<{ units: Unit[] }>("/api/units");
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<"create" | null>(null);
  const units = data?.units ?? [];
  const active = units.find((unit) => unit.id === selected) ?? units[0];
  return <>
    <div className="unit-toolbar"><p>查看成員可共用 DNS；編輯與管理成員可送出申請，均須系統管理員審核。</p><div className="unit-actions">{systemAdmin && <button className="button primary" onClick={() => setMode("create")}><Plus size={16} aria-hidden="true" />建立單位</button>}<button className="button" disabled={loading} onClick={() => void reload()} aria-label="重新載入單位"><RefreshCw size={16} className={loading ? "spin" : ""} /></button></div></div>
    {loading && <p role="status">正在載入單位…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && !units.length && <div className="card"><EmptyState title="尚未加入單位" description={systemAdmin ? "建立單位並透過學號指定管理人，再由管理人維護學號白名單。" : "請聯絡單位管理員或系統管理員將你的學號加入白名單。加入後預設為查看角色。"} /></div>}
    {!loading && !error && active && <div className="unit-layout"><nav className="card unit-selector" aria-label="我的單位">{units.map((unit) => <button key={unit.id} type="button" aria-current={active.id === unit.id ? "true" : undefined} onClick={() => setSelected(unit.id)}><Building2 size={18} /><span><strong>{unit.name}</strong><small>{statusLabels[unit.status]} · {unitRoleLabels[unit.role]} · {unit.memberCount} 位成員</small></span></button>)}</nav><UnitDetail key={active.id} id={active.id} onMembershipChanged={reload} /></div>}
    {mode && <UnitEntryDialog onClose={() => setMode(null)} onSaved={async (result) => { setMode(null); setSelected(result.unit.id); toast.success("已建立單位並指定管理人"); await reload(); }} />}
  </>;
}

function UnitEntryDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (result: { unit: { id: string; name: string } }) => Promise<void> }) {
  return <ActionDialog title="建立單位" description="建立後立即生效。管理人須先登入註冊，再由管理人維護學號白名單及成員權限。" label="建立並指定管理人" onClose={onClose} submit={async (form) => {
    const result = await apiRequest<{ unit: { id: string; name: string } }>("/api/units", jsonRequest("POST", { action: "create", name: form.get("name"), managerStudentId: form.get("managerStudentId") })); await onSaved(result);
  }}>{(error, errorId) => <><label>單位名稱<input name="name" required maxLength={100} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label><label>管理人學號<input name="managerStudentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label></>}</ActionDialog>;
}

function UnitDetail({ id, onMembershipChanged }: { id: string; onMembershipChanged: () => Promise<void> }) {
  const { data, loading, error, reload } = useResource<Detail>(`/api/units/${encodeURIComponent(id)}`);
  const [query, setQuery] = useState("");
  const [change, setChange] = useState<UnitRecord | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [review, setReview] = useState<"APPROVE" | "REJECT" | null>(null);
  const [manage, setManage] = useState<Member | null>(null);
  const [allowlist, setAllowlist] = useState<{ studentId?: string } | null>(null);
  if (loading) return <section className="card unit-panel"><p role="status">正在載入單位 DNS 與成員…</p></section>;
  if (error || !data) return <section className="card unit-panel"><p className="form-error" role="alert">{error || "找不到單位"}</p><button className="button" onClick={() => void reload()}>重新載入</button></section>;
  const assignManagerDialog = assigning && <AssignManagerDialog unitId={id} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); toast.success("已指定單位管理人"); await onMembershipChanged(); await reload(); }} />;
  if (data.unit.status !== "APPROVED") return <section className="card unit-panel"><h2>{data.unit.name}</h2><p role="status">{statusLabels[data.unit.status]}。核准前無法加入單位或申請 DNS。</p><p>單位管理員：{data.members.filter((member) => member.role === "ADMIN").map((member) => member.studentId ? `${member.label}（${member.studentId}）` : member.label).join("、")}</p>{data.canReview && <button className="button" onClick={() => setAssigning(true)}>指定單位管理人</button>}{assignManagerDialog}{data.unit.reviewNote && <p>審核說明：{data.unit.reviewNote}</p>}{data.canReview && data.unit.status === "PENDING" && <div className="unit-actions"><button className="button primary" onClick={() => setReview("APPROVE")}>核准單位</button><button className="button" onClick={() => setReview("REJECT")}>退回單位</button></div>}{review && <ActionDialog title={review === "APPROVE" ? "核准單位" : "退回單位"} description={review === "APPROVE" ? "核准後單位即可管理成員及提出 DNS 申請。" : "退回後此單位無法使用。"} label="確認審核" onClose={() => setReview(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "review", decision: review, note: form.get("note") })); setReview(null); toast.success("單位審核已完成"); await onMembershipChanged(); await reload(); }}><label>審核說明<textarea name="note" maxLength={1000} rows={3} /></label></ActionDialog>}</section>;
  const records = data.records.filter((record) => [record.recordName, record.recordType, record.content, record.purpose].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="unit-detail"><div className="card unit-panel"><div className="unit-heading"><div><h2>{data.unit.name}</h2><p>{unitRoleLabels[data.role]} · {data.records.length} 筆目前有效的 DNS</p></div><div className="unit-actions">{data.canApply && <Link className="button primary" href="/requests/new">申請單位 DNS</Link>}<Link className="button" href="/requests">查看申請進度</Link><button className="button" aria-label="重新載入 DNS" onClick={() => void reload()}><RefreshCw size={16} /></button></div></div><label className="unit-search">搜尋 DNS<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="名稱、類型、解析內容、用途" /></label>
    <ScrollRegion label="單位 DNS 紀錄" className="unit-record-scroll"><table className="unit-table"><thead><tr><th scope="col">名稱／類型</th><th scope="col">解析內容</th><th scope="col">用途</th><th scope="col">操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.recordName}</strong><small>{record.recordType} · TTL {record.ttl}s{record.disabled ? " · 已停用" : ""}</small></td><td><code>{record.content}</code></td><td>{record.purpose || "—"}</td><td>{data.canApply && ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(record.recordType) ? <button className="button" onClick={() => setChange(record)}>申請變更</button> : "僅供查看"}</td></tr>)}</tbody></table></ScrollRegion>
    {data.recordsError && <p className="form-error" role="alert">{data.recordsError}</p>}
    {!records.length && !data.recordsError && <EmptyState title={query ? "沒有符合條件的 DNS" : "尚無單位 DNS"} description={query ? "請調整搜尋條件。" : "申請時選擇共享單位，經系統管理員核准後會出現在此處。舊的文字單位欄位不會自動授予共享權限。"} />}</div>
    <div className="card unit-panel"><div className="unit-heading"><h2><Users size={18} />單位成員</h2><div className="unit-actions">{data.canReview && <button className="button" onClick={() => setAssigning(true)}>指定單位管理人</button>}{data.role === "ADMIN" && <button className="button" onClick={() => setAllowlist({})}>新增學號白名單</button>}</div></div><p className="description">查看：讀取 DNS。編輯：送出申請。單位管理：另可管理成員；不具備 DNS 審核權。</p><ul className="unit-members">{data.members.map((member) => <li key={member.userId}><span><strong>{member.label}</strong><small>{member.studentId && member.studentId !== member.label ? `${member.studentId} · ` : ""}{unitRoleLabels[member.role]}{member.disabled ? " · 帳號已停用" : ""}</small></span>{data.role === "ADMIN" && <button className="button" onClick={() => setManage(member)}>管理</button>}</li>)}</ul></div>
    {data.role === "ADMIN" && <div className="card unit-panel"><h2>學號白名單</h2><p className="description">已註冊者立即加入；未註冊者登入後自動加入，預設為查看角色。移除白名單也會移出單位。</p><ul className="unit-members">{data.allowlist.map((entry) => <li key={entry.studentId}><span><strong>{entry.studentId}</strong><small>{entry.userId ? "已加入" : "等待使用者登入"}</small></span><button className="button" aria-label={`移除學號 ${entry.studentId}`} onClick={() => setAllowlist({ studentId: entry.studentId })}>移除</button></li>)}</ul>{!data.allowlist.length && <p>尚無白名單。</p>}</div>}
    {allowlist && <ActionDialog title={allowlist.studentId ? "移除學號白名單" : "新增學號白名單"} description={allowlist.studentId ? `移除 ${allowlist.studentId} 的白名單及本單位成員權限。至少需保留一位可登入的管理員。` : "輸入完整學號，可預先加入尚未註冊的使用者。已有成員的權限會保留。"} label={allowlist.studentId ? "確認移除" : "加入白名單"} onClose={() => setAllowlist(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "allowlist", studentId: allowlist.studentId ?? form.get("studentId"), remove: !!allowlist.studentId })); setAllowlist(null); toast.success("白名單已更新"); await onMembershipChanged(); await reload(); }}>{(error, errorId) => !allowlist.studentId && <label>學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label>}</ActionDialog>}
    {assignManagerDialog}
    {change && <ChangeDialog unitId={id} record={change} onClose={() => setChange(null)} onSaved={async () => { setChange(null); toast.success("變更申請已送出，核准前不會修改 DNS"); await reload(); }} />}
    {manage && <ManageDialog unitId={id} target={manage} onClose={() => setManage(null)} onSaved={async () => { setManage(null); toast.success("成員設定已更新"); await onMembershipChanged(); await reload(); }} />}
  </section>;
}

function ChangeDialog({ unitId, record, onClose, onSaved }: { unitId: string; record: UnitRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  return <ActionDialog title="申請變更 DNS" description="只變更這一筆解析內容；名稱、類型與共用 TTL 維持不變。須系統管理員審核後才會生效。" onClose={onClose} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}/changes`, jsonRequest("POST", { recordId: record.id, content: form.get("content"), purpose: form.get("purpose"), expectedHash: record.expectedHash })); await onSaved(); }} label="送出變更申請"><p><strong>{record.recordName}</strong> · {record.recordType}</p><p>原解析內容：<code className="unit-wrap">{record.content}</code></p><label>新解析內容<textarea name="content" defaultValue={record.content} required maxLength={65535} rows={3} spellCheck={false} autoCapitalize="none" /></label><label>變更原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>;
}
function AssignManagerDialog({ unitId, onClose, onSaved }: { unitId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const helpId = useId();
  return <ActionDialog title="指定單位管理人" description="透過學號將已註冊且啟用的使用者加入單位，授予單位管理權限；既有管理人仍保留權限。" onClose={onClose} label="指定管理人" submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "assign-manager", studentId: form.get("studentId") })); await onSaved(); }}>{(error, errorId) => <><label>管理人學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} /></label><p id={helpId} className="field-help">管理人須先登入註冊。此權限僅適用於本單位。</p></>}</ActionDialog>;
}
function ManageDialog({ unitId, target, onClose, onSaved }: { unitId: string; target: Member; onClose: () => void; onSaved: () => Promise<void> }) {
  return <ActionDialog title={`管理成員 · ${target.label}`} description="至少需保留一位可登入的單位管理員。移除成員也會撤銷其學號白名單。" onClose={onClose} label="確認更新" submit={async (form) => { const role = form.get("role"); await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "member", userId: target.userId, role: role === "REMOVE" ? null : role })); await onSaved(); }}><label>成員角色<Select name="role" aria-label="成員角色" defaultValue={target.role} options={[...Object.entries(unitRoleLabels).map(([value, label]) => ({ value, label })), { value: "REMOVE", label: "移出單位" }]} /></label></ActionDialog>;
}
function ActionDialog({ title, description, children, label, submit, onClose }: { title: string; description: string; children?: React.ReactNode | ((error: string, errorId: string) => React.ReactNode); label: string; submit: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [pending, setPending] = useState(false); const sending = useRef(false);
  const [error, setError] = useState(""); const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title={title} description={description} pending={pending} onClose={onClose}><form onSubmit={async (event) => { event.preventDefault(); if (sending.current) return; const form = new FormData(event.currentTarget); sending.current = true; setPending(true); setError(""); try { await submit(form); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成，請重試。"); } finally { sending.current = false; setPending(false); } }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{typeof children === "function" ? children(error, errorId) : children}{error && <p id={errorId} className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}</div><div className="modal-foot"><button className="button" type="button" onClick={onClose}>取消</button><SubmitButton pending={pending} label={label} /></div></fieldset></form></Dialog>;
}
