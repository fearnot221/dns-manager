"use client";
import { useFormDraft, type FormDrafts } from "@/lib/client/form-draft";
import { matchesDnsRecord } from "@/lib/dns/search";
import { UnitRecordFields } from "./unit-record-fields";
import { inspectionEventLabel, type InspectionEventSnapshot } from "@/lib/inspection-events/model";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnitWorkspace } from "./unit-workspace";
import { ResourceError } from "@/components/ui/resource-error";
import { Building2, Plus, RefreshCw, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { useResource } from "@/lib/client/use-resource";
import { unitRoleLabels, type UnitRole } from "@/lib/units/policy";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingPanel, SubmitButton } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select } from "@/components/ui/select";

type UnitStatus = "PENDING" | "APPROVED" | "REJECTED";
const statusLabels = { PENDING: "待啟用", APPROVED: "啟用中", REJECTED: "已停用" };
type Unit = { status: UnitStatus; id: string; name: string; role: UnitRole; memberCount: number };
type UnitRecord = { id: string; zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; purpose: string; expectedHash: string; expectedUpdatedAt: string; applicantName?: string; applicantEmail?: string; applicantExtension?: string; applicantUnit?: string; inspections?: (InspectionEventSnapshot & { id: string; inspectedAt: string; inspectorName: string; note: string })[] };
type Member = { userId: string; label: string; studentId?: string | null; role: UnitRole; disabled: boolean };
type Detail = { allowlist: { studentId: string; userId: string | null }[]; unit: { id: string; name: string; status: UnitStatus }; systemAdmin: boolean; canApply: boolean; role: UnitRole; members: Member[]; records: UnitRecord[]; recordsError: string };

export function UnitsWorkbench({ systemAdmin, mode = "manage" }: { systemAdmin: boolean; mode?: "dns" | "manage" }) {
  const workspace = useUnitWorkspace();
  const router = useRouter();
  const { data, loading, error, reload } = useResource<{ units: Unit[] }>("/api/units");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const units = (data?.units ?? []).filter((unit) => mode === "dns" ? unit.id === workspace.active?.id : systemAdmin || unit.role === "ADMIN" && unit.id === workspace.active?.id);
  const active = units.find((unit) => unit.id === selected) ?? units[0];
  return <>
    {mode === "manage" && <div className="unit-toolbar"><p>查看單位使用者並管理權限。</p><div className="unit-actions">{systemAdmin && <button className="button primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />建立單位</button>}<button className="button" disabled={loading} onClick={() => { void reload(); router.refresh(); }} aria-label="重新載入單位"><RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" /></button></div></div>}
    {loading && !data && <LoadingPanel label="正在載入單位…" />}
    {error && <ResourceError message={error} retry={reload} />}
    {!!data && !error && !units.length && <div className="card"><EmptyState title={mode === "manage" ? "尚無可管理的單位" : "尚未加入單位"} description={mode === "manage" && systemAdmin ? "可先建立單位，之後再透過學號指定管理人或新增使用者。" : mode === "manage" ? "目前單位未授予管理權限。若你管理其他單位，請切換至該單位的工作區。" : "請提供學號給單位管理員或系統管理員，由管理員將你加入單位。加入後預設為成員，可送出 DNS 申請。"} /></div>}
    {!error && active && <div className={units.length > 1 ? "unit-layout" : "unit-layout unit-layout-single"}>{units.length > 1 && <nav className="card unit-selector" aria-label="選擇管理單位">{units.map((unit) => <button key={unit.id} type="button" aria-current={active.id === unit.id ? "true" : undefined} onClick={() => setSelected(unit.id)}><Building2 size={18} aria-hidden="true" /><span><strong>{unit.name}</strong><small>{statusLabels[unit.status]} · {unit.memberCount} 位成員</small></span></button>)}</nav>}<UnitDetail key={active.id} id={active.id} mode={mode} onMembershipChanged={async () => { await reload(); router.refresh(); }} /></div>}
    {creating && <UnitEntryDialog onClose={() => setCreating(false)} onSaved={async (result) => { setCreating(false); setSelected(result.unit.id); toast.success("已建立單位"); await reload(); router.refresh(); }} />}
  </>;
}

function UnitEntryDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (result: { unit: { id: string; name: string } }) => Promise<void> }) {
  return <ActionDialog title="建立單位" description="建立後立即生效。可先不設定管理人，之後再指定；指定的管理人須先登入註冊。" label="建立單位" onClose={onClose} submit={async (form) => {
    const result = await apiRequest<{ unit: { id: string; name: string } }>("/api/units", jsonRequest("POST", { action: "create", name: form.get("name"), managerStudentId: form.get("managerStudentId") })); await onSaved(result);
  }}>{(error, errorId) => <><label>單位名稱<input name="name" required maxLength={100} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label><label>管理人學號（選填）<input name="managerStudentId" maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label></>}</ActionDialog>;
}

function UnitDetail({ id, mode, onMembershipChanged }: { id: string; mode: "dns" | "manage"; onMembershipChanged: () => Promise<void> }) {
  const workspace = useUnitWorkspace();
  const { data, loading, error, reload } = useResource<Detail>(`/api/units/${encodeURIComponent(id)}?view=${mode}`);
  const [query, setQuery] = useState("");
  const [change, setChange] = useState<UnitRecord | null>(null);
  const [deletion, setDeletion] = useState<UnitRecord | null>(null);
  const [inspectionDrafts] = useState<FormDrafts>(() => new Map());
  const [inspection, setInspection] = useState<UnitRecord | null>(null);
  const [unitAction, setUnitAction] = useState<"rename" | "delete" | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [manage, setManage] = useState<Member | null>(null);
  const [allowlist, setAllowlist] = useState<{ studentId?: string } | null>(null);
  if (loading && !data) return <LoadingPanel label="正在載入單位資料…" />;
  if (error || !data) return <section className="card unit-panel"><p className="form-error" role="alert">{error || "找不到單位"}</p><button className="button" onClick={() => void reload()}>重新載入</button></section>;
  const assignManagerDialog = mode === "manage" && assigning && <AssignManagerDialog unitId={id} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); toast.success("已指定單位管理人"); await onMembershipChanged(); await reload(); }} />;
  const unitControls = mode === "manage" && data.systemAdmin && <div className="unit-actions"><button className="button" onClick={() => setUnitAction("rename")}>修改單位名稱</button><button className="button danger" disabled={data.members.length > 0} aria-describedby={data.members.length > 0 ? `unit-delete-help-${id}` : undefined} onClick={() => setUnitAction("delete")}>刪除單位</button>{data.members.length > 0 && <p id={`unit-delete-help-${id}`} className="field-help unit-delete-help">需先移出所有成員，且單位沒有 DNS 解析值與待審核申請，才能刪除。</p>}</div>;
  const unitDialog = unitAction && <ActionDialog title={unitAction === "rename" ? "修改單位名稱" : "刪除單位"} description={unitAction === "rename" ? "更新單位及目前 DNS 歸屬資料的名稱，歷史申請保留原名稱。" : `確定刪除「${data.unit.name}」？加入名單將一併移除。仍有成員、DNS 解析值或待審核申請時無法刪除；已結案申請及清查歷史會保留。`} label={unitAction === "rename" ? "儲存名稱" : "確認刪除"} tone={unitAction === "delete" ? "danger" : "primary"} onClose={() => setUnitAction(null)} submit={async (form) => {
    await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", unitAction === "rename" ? { action: "rename", name: form.get("name") } : { action: "delete" }));
    const renamed = unitAction === "rename";
    setUnitAction(null); toast.success(renamed ? "單位名稱已更新" : "單位已刪除");
    await onMembershipChanged(); if (renamed) await reload();
  }}>{unitAction === "rename" && <label>單位名稱<input name="name" required maxLength={100} defaultValue={data.unit.name} /></label>}</ActionDialog>;
  if (data.unit.status !== "APPROVED") return <section className="card unit-panel"><h2>{data.unit.name}</h2>{unitControls}{unitDialog}<p role="status">此單位未啟用，無法加入或申請 DNS。</p></section>;
  const records = data.records.filter((record) => matchesDnsRecord(query, record.recordName, record.zoneName, [record.recordType, record.content, record.purpose]));
  return <section className="unit-detail">{unitControls}{unitDialog}{(mode === "dns" || data.systemAdmin) && <div className="card unit-panel"><div className="unit-heading"><div><h2>{data.unit.name}</h2><p>{mode === "dns" ? `${unitRoleLabels[workspace.active?.role ?? "EDITOR"]} · ` : ""}{data.records.length} 筆目前有效的 DNS</p></div><div className="unit-actions">{mode === "dns" && data.canApply && <Link className="button primary" href="/requests/new">申請 DNS</Link>}{mode === "dns" && <Link className="button" href="/requests">申請紀錄</Link>}<button className="button" aria-label="重新載入 DNS" onClick={() => void reload()}><RefreshCw size={16} /></button></div></div><div className="filter-input unit-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} placeholder="搜尋名稱、類型、解析內容或用途" aria-label="搜尋 DNS" />{query && <button type="button" className="search-clear" aria-label="清除搜尋" onClick={() => setQuery("")}><X size={15} /></button>}</div>
    <ScrollRegion label="單位 DNS 紀錄" className="unit-record-scroll"><table className="unit-table"><thead><tr><th scope="col">名稱／類型</th><th scope="col">解析內容</th><th scope="col">用途</th><th scope="col">操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.recordName}</strong><small>{record.recordType} · TTL {record.ttl}s{record.disabled ? " · 已停用" : ""}</small></td><td><code>{record.content}</code></td><td>{record.purpose || "—"}</td><td>{mode === "dns" ? <div className="unit-actions unit-row-actions"><button className="button compact" onClick={() => setInspection(record)}>清查</button>{data.canApply && ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(record.recordType) && <><button className="button compact" onClick={() => setChange(record)}>申請變更</button><button className="button compact danger" onClick={() => setDeletion(record)}>申請刪除</button></>}</div> : <span className="muted">僅供查看</span>}</td></tr>)}</tbody></table></ScrollRegion>
    {data.recordsError && <p className="form-error" role="alert">{data.recordsError}</p>}
    {!records.length && !data.recordsError && <EmptyState title={query ? "沒有符合條件的 DNS" : "尚無單位 DNS"} description={query ? "請調整搜尋條件。" : "此單位的 DNS 經系統管理員核准後，會顯示在這裡。"} />}</div>}
    {mode === "manage" && data.role === "ADMIN" && <div className="card unit-panel"><div className="unit-heading"><h2><Users size={18}  aria-hidden="true" />{data.unit.name} · 使用者管理</h2><div className="unit-actions">{mode === "manage" && data.systemAdmin && <button className="button" onClick={() => setAssigning(true)}>指定單位管理人</button>}{data.role === "ADMIN" && <button className="button" onClick={() => setAllowlist({})}>新增使用者</button>}</div></div><p className="description">成員與管理員皆可清查 DNS 及送出申請；管理員另可管理成員權限與移除成員。單位角色不具備 DNS 審核權。</p><ul className="unit-members">{data.members.map((member) => <li key={member.userId}><span><strong>{member.label}</strong><small>{member.studentId && member.studentId !== member.label ? `${member.studentId} · ` : ""}{unitRoleLabels[member.role]}{member.disabled ? " · 帳號已停用" : ""}</small></span>{data.role === "ADMIN" && <button className="button" aria-label={`管理 ${member.studentId || member.label} 的單位權限`} onClick={() => setManage(member)}>管理權限</button>}</li>)}</ul></div>}
    {mode === "manage" && data.role === "ADMIN" && data.allowlist.some((entry) => !entry.userId) && <div className="card unit-panel"><h2>待加入的使用者</h2><p className="description">以下使用者尚未登入，登入後會自動加入單位，預設為成員。</p><ul className="unit-members">{data.allowlist.filter((entry) => !entry.userId).map((entry) => <li key={entry.studentId}><span><strong>{entry.studentId}</strong><small>{entry.userId ? "已加入" : "等待使用者登入"}</small></span><button className="button" aria-label={`移除使用者 ${entry.studentId}`} onClick={() => setAllowlist({ studentId: entry.studentId })}>移除</button></li>)}</ul></div>}
    {allowlist && <ActionDialog title={allowlist.studentId ? "移除使用者" : "新增使用者"} description={allowlist.studentId ? `取消使用者 ${allowlist.studentId} 加入本單位。之後若要加入，需由管理員重新新增。` : "輸入完整學號，可預先加入尚未註冊的使用者。已有成員的權限會保留。"} label={allowlist.studentId ? "確認移除" : "新增使用者"} tone={allowlist.studentId ? "danger" : "primary"} onClose={() => setAllowlist(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "allowlist", studentId: allowlist.studentId ?? form.get("studentId"), remove: !!allowlist.studentId })); setAllowlist(null); toast.success("使用者設定已更新"); await onMembershipChanged(); await reload(); }}>{(error, errorId) => !allowlist.studentId && <label>學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label>}</ActionDialog>}
    {assignManagerDialog}
    {inspection && <ActionDialog drafts={inspectionDrafts} draftKey={JSON.stringify([id, inspection.id, inspection.expectedUpdatedAt, inspection.expectedHash])} title="DNS 清查" description="確認聯絡資料、用途及使用情形，儲存後會更新清查資料並留下紀錄，不會修改 DNS 解析或所屬單位。" label="儲存並記錄清查" onClose={() => setInspection(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}/inspections`, jsonRequest("POST", { recordId: inspection.id, expectedHash: inspection.expectedHash, note: form.get("note"), ownership: { expectedUpdatedAt: inspection.expectedUpdatedAt, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantExtension: form.get("applicantExtension"), purpose: form.get("purpose") } })); setInspection(null); toast.success("清查已記錄"); await reload(); }}><p><strong>{inspection.recordName}</strong> · {inspection.recordType}</p><code className="unit-wrap">{inspection.content}</code><UnitRecordFields record={inspection} /><label>清查備註<textarea name="note" maxLength={1000} rows={3} /></label><section className="unit-inspection-history" aria-label="清查歷史"><h3>清查歷史</h3>{inspection.inspections?.length ? <ul>{inspection.inspections.map((entry) => <li key={entry.id}><p><time dateTime={entry.inspectedAt}>{new Date(entry.inspectedAt).toLocaleString("zh-TW")}</time> · {entry.inspectorName}</p><p className="unit-wrap">{inspectionEventLabel(entry)}</p><p className="unit-wrap">{entry.note || "無備註"}</p></li>)}</ul> : <p>尚無清查紀錄</p>}</section></ActionDialog>}
    {deletion && <ActionDialog title="申請刪除 DNS" description="系統管理員核准後才會刪除這一筆解析值，其餘解析值會保留。送出申請不會立即刪除 DNS。" label="送出刪除申請" onClose={() => setDeletion(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}/changes`, jsonRequest("POST", { operation: "DELETE", recordId: deletion.id, expectedHash: deletion.expectedHash, purpose: form.get("purpose") })); setDeletion(null); toast.success("刪除申請已送出，等待管理員審核"); await reload(); }}><p><strong>{deletion.recordName}</strong> · {deletion.recordType}</p><code className="unit-wrap">{deletion.content}</code><UnitRecordContact record={deletion} /><label>刪除原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>}
    {change && <ChangeDialog unitId={id} record={change} onClose={() => setChange(null)} onSaved={async () => { setChange(null); toast.success("變更申請已送出，核准前不會修改 DNS"); await reload(); }} />}
    {manage && <ManageDialog unitId={id} target={manage} onClose={() => setManage(null)} onSaved={async () => { setManage(null); toast.success("使用者權限已更新"); await onMembershipChanged(); await reload(); }} />}
  </section>;
}

function UnitRecordContact({ record }: { record: UnitRecord }) {
  return <dl className="request-contact-details"><div><dt>申請人</dt><dd>{record.applicantName || "—"}</dd></div><div><dt>申請人電子郵件</dt><dd>{record.applicantEmail || "—"}</dd></div><div><dt>申請單位／分機</dt><dd>{record.applicantUnit || "—"}／{record.applicantExtension || "—"}</dd></div><div><dt>DNS 用途</dt><dd className="unit-wrap">{record.purpose || "—"}</dd></div></dl>;
}

function ChangeDialog({ unitId, record, onClose, onSaved }: { unitId: string; record: UnitRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  return <ActionDialog title="申請變更 DNS" description="更換這筆解析內容時，可一併更新聯絡資料與用途。名稱、類型與共用 TTL 維持不變，核准後才生效。" onClose={onClose} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}/changes`, jsonRequest("POST", { recordId: record.id, content: form.get("content"), purpose: form.get("purpose"), expectedHash: record.expectedHash, ownership: { expectedUpdatedAt: record.expectedUpdatedAt, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantExtension: form.get("applicantExtension"), purpose: form.get("recordPurpose") } })); await onSaved(); }} label="送出變更申請"><p><strong>{record.recordName}</strong> · {record.recordType}</p><p>原解析內容：<code className="unit-wrap">{record.content}</code></p><label>新解析內容<textarea name="content" defaultValue={record.content} required maxLength={65535} rows={3} spellCheck={false} autoCapitalize="none" /></label><UnitRecordFields record={record} purposeName="recordPurpose" /><label>變更原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>;
}
function AssignManagerDialog({ unitId, onClose, onSaved }: { unitId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const helpId = useId();
  return <ActionDialog title="指定單位管理人" description="透過學號將已註冊且啟用的使用者加入單位，授予單位管理權限；既有管理人仍保留權限。" onClose={onClose} label="指定管理人" submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "assign-manager", studentId: form.get("studentId") })); await onSaved(); }}>{(error, errorId) => <><label>管理人學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} /></label><p id={helpId} className="field-help">管理人須先登入註冊。此權限僅適用於本單位。</p></>}</ActionDialog>;
}
function ManageDialog({ unitId, target, onClose, onSaved }: { unitId: string; target: Member; onClose: () => void; onSaved: () => Promise<void> }) {
  const [choice, setChoice] = useState<string>(target.role);
  const removing = choice === "REMOVE";
  return <ActionDialog title={`管理使用者 · ${target.label}`} description="單位管理員須保留至少一位可登入的管理員；系統管理員可移除最後一位管理員。移除使用者後，對方將無法存取本單位；若要重新加入，需由管理員新增。" onClose={onClose} label={removing ? "確認移出單位" : "更新角色"} tone={removing ? "danger" : "primary"} submit={async (form) => { const role = form.get("role"); await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "member", userId: target.userId, role: role === "REMOVE" ? null : role })); await onSaved(); }}><label>使用者角色<Select name="role" aria-label="使用者角色" value={choice} onChange={setChoice} options={[...Object.entries(unitRoleLabels).map(([value, label]) => ({ value, label })), { value: "REMOVE", label: "移出單位" }]} /></label></ActionDialog>;
}
function ActionDialog({ drafts, draftKey, title, description, children, label, tone = "primary", submit, onClose }: { drafts?: FormDrafts; draftKey?: string; title: string; description: string; children?: React.ReactNode | ((error: string, errorId: string) => React.ReactNode); label: string; tone?: "primary" | "danger"; submit: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [pending, setPending] = useState(false); const sending = useRef(false);
  const [error, setError] = useState(""); const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const { attachForm, onChange: captureDraft, clear: clearDraft } = useFormDraft(drafts, draftKey);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title={title} description={description} pending={pending} onClose={onClose}><form ref={attachForm} onChange={captureDraft} onSubmit={async (event) => { event.preventDefault(); if (sending.current) return; const form = new FormData(event.currentTarget); sending.current = true; setPending(true); setError(""); try { await submit(form); clearDraft(); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成，請重試。"); } finally { sending.current = false; setPending(false); } }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{typeof children === "function" ? children(error, errorId) : children}{error && <p id={errorId} className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}</div><div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} label={label} tone={tone} /></div></fieldset></form></Dialog>;
}
