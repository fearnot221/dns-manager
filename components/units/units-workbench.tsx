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
import { unitDepartments, unitRoleLabels, type UnitRole } from "@/lib/units/policy";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingPanel, PageHeader, SubmitButton } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select } from "@/components/ui/select";

type UnitStatus = "PENDING" | "APPROVED" | "REJECTED";
const statusLabels = { PENDING: "待啟用", APPROVED: "啟用中", REJECTED: "已停用" };
const departmentOptions = unitDepartments.map((value) => ({ value, label: value }));
type Unit = { status: UnitStatus; id: string; name: string; department: string | null; role: UnitRole };
type UnitRecord = { id: string; zoneName: string; recordName: string; recordType: string; content: string; ttl: number; disabled: boolean; purpose: string; expectedHash: string; expectedUpdatedAt: string; applicantName?: string; applicantEmail?: string; applicantExtension?: string; applicantUnit?: string; inspections?: (InspectionEventSnapshot & { id: string; inspectedAt: string; inspectorName: string; note: string })[] };
type Member = { userId: string; label: string; studentId?: string | null; role: UnitRole; disabled: boolean };
type Detail = { allowlist: { studentId: string; userId: string | null; role?: UnitRole }[]; unit: { id: string; name: string; note?: string; department?: string | null; location?: string; extension?: string; advisor?: string; status: UnitStatus }; systemAdmin: boolean; canApply: boolean; role: UnitRole; members: Member[]; records: UnitRecord[]; recordsError: string };

export function UnitsWorkbench({ systemAdmin, mode = "manage" }: { systemAdmin: boolean; mode?: "dns" | "manage" }) {
  const workspace = useUnitWorkspace();
  const router = useRouter();
  const { data, loading, error, reload } = useResource<{ units: Unit[] }>("/api/units");
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const units = (data?.units ?? []).filter((unit) => mode === "dns" ? unit.id === workspace.active?.id : systemAdmin || unit.role === "ADMIN" && unit.id === workspace.active?.id);
  const active = units.find((unit) => unit.id === selected) ?? units[0];
  return <>
    {mode === "manage" && <PageHeader title="單位管理" actions={<>{systemAdmin && <button className="button primary" onClick={() => setCreating(true)}><Plus size={16} aria-hidden="true" />建立單位</button>}<button className="button" disabled={loading} onClick={() => { void reload(); router.refresh(); }} aria-label="重新載入單位"><RefreshCw size={16} className={loading ? "spin" : ""} aria-hidden="true" /></button></>} />}
    {loading && !data && <LoadingPanel label="正在載入單位…" />}
    {error && <ResourceError message={error} retry={reload} />}
    {!!data && !error && !units.length && <div className="card"><EmptyState title={mode === "manage" ? "尚無可管理的單位" : "尚未加入單位"} description={mode === "manage" && systemAdmin ? "可先建立單位，之後再透過學號指定管理人或新增使用者。" : mode === "manage" ? "目前單位未授予管理權限。若你管理其他單位，請切換至該單位的工作區。" : "請將學號提供給單位管理員，由管理員將你加入單位。"} /></div>}
    {!error && active && <div className={units.length > 1 ? "unit-layout" : "unit-layout unit-layout-single"}>{units.length > 1 && <UnitSelector units={units} activeId={active.id} onSelect={setSelected} />}<UnitDetail key={active.id} id={active.id} mode={mode} onMembershipChanged={async () => { await reload(); router.refresh(); }} /></div>}
    {creating && <UnitEntryDialog onClose={() => setCreating(false)} onSaved={async (result) => { setCreating(false); setSelected(result.unit.id); toast.success("已建立單位"); await reload(); router.refresh(); }} />}
  </>;
}

const unassigned = "未設定系所";
const departmentNames = [...new Set(unitDepartments.map((value) => value.split("／")[0]))];
const departmentFilterOptions = [{ value: "", label: "全部系所" }, ...departmentNames.map((value) => ({ value, label: value })), { value: unassigned, label: unassigned }];

/** Units grouped by 系所 → 組別 in policy order, with name/department search and a 系所 filter. */
function UnitSelector({ units, activeId, onSelect }: { units: Unit[]; activeId: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = units
    .filter((unit) => (!department || (unit.department?.split("／")[0] ?? unassigned) === department) && (!needle || `${unit.name} ${unit.department ?? unassigned}`.toLowerCase().includes(needle)))
    .sort((a, b) => (a.department ? unitDepartments.indexOf(a.department) : unitDepartments.length) - (b.department ? unitDepartments.indexOf(b.department) : unitDepartments.length));
  const sections: { name: string; groups: { name: string; units: Unit[] }[] }[] = [];
  for (const unit of visible) {
    const [name, group = ""] = unit.department?.split("／") ?? [unassigned];
    let section = sections.at(-1);
    if (section?.name !== name) sections.push(section = { name, groups: [] });
    let bucket = section.groups.at(-1);
    if (bucket?.name !== group) section.groups.push(bucket = { name: group, units: [] });
    bucket.units.push(unit);
  }
  return <nav className="card unit-selector" aria-label="選擇管理單位">
    <div className="unit-selector-filters">
      <div className="filter-input"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} placeholder="搜尋單位或組別" aria-label="搜尋單位" />{query && <button type="button" className="search-clear" aria-label="清除搜尋" onClick={() => setQuery("")}><X size={15} /></button>}</div>
      <Select aria-label="篩選系所" value={department} onChange={setDepartment} options={departmentFilterOptions} />
    </div>
    {sections.map((section) => <section key={section.name} className="unit-selector-section" aria-label={section.name}><h3>{section.name}</h3>{section.groups.map((group) => <div key={group.name} className="unit-selector-group">{group.name && <p>{group.name}</p>}<div className="unit-selector-items">{group.units.map((unit) => <button key={unit.id} type="button" aria-current={activeId === unit.id ? "true" : undefined} onClick={() => onSelect(unit.id)}><span className="unit-selector-text"><strong>{unit.name}</strong>{unit.status !== "APPROVED" && <small>{statusLabels[unit.status]}</small>}</span></button>)}</div></div>)}</section>)}
    {!sections.length && <p className="field-help unit-selector-empty" role="status">沒有符合條件的單位</p>}
  </nav>;
}

function UnitEntryDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (result: { unit: { id: string; name: string } }) => Promise<void> }) {
  return <ActionDialog title="建立單位" description="可透過學號預先指定管理人，首次登入後自動取得管理權限。" label="建立單位" onClose={onClose} submit={async (form) => {
    const result = await apiRequest<{ unit: { id: string; name: string } }>("/api/units", jsonRequest("POST", { action: "create", name: form.get("name"), managerStudentId: form.get("managerStudentId"), note: form.get("note"), department: form.get("department"), location: form.get("location"), extension: form.get("extension"), advisor: form.get("advisor") })); await onSaved(result);
  }}>{(error, errorId) => <><label>單位名稱<input name="name" required maxLength={100} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label><label>所屬系所／組別<Select name="department" aria-label="所屬系所／組別" options={departmentOptions} /></label><UnitProfileFields /><label>單位備註（選填）<textarea name="note" maxLength={2000} rows={3} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label><label>管理人學號（選填）<input name="managerStudentId" maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label></>}</ActionDialog>;
}

function UnitDetail({ id, mode, onMembershipChanged }: { id: string; mode: "dns" | "manage"; onMembershipChanged: () => Promise<void> }) {
  const workspace = useUnitWorkspace();
  const { data, loading, error, reload } = useResource<Detail>(`/api/units/${encodeURIComponent(id)}?view=${mode}`);
  const [query, setQuery] = useState("");
  const [change, setChange] = useState<UnitRecord | null>(null);
  const [deletion, setDeletion] = useState<UnitRecord | null>(null);
  const [inspectionDrafts] = useState<FormDrafts>(() => new Map());
  const [inspection, setInspection] = useState<UnitRecord | null>(null);
  const [unitAction, setUnitAction] = useState<"rename" | "department" | "delete" | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [manage, setManage] = useState<Member | null>(null);
  const [allowlist, setAllowlist] = useState<{ studentId?: string } | null>(null);
  if (loading && !data) return <LoadingPanel label="正在載入單位資料…" />;
  if (error || !data) return <section className="card unit-panel"><p className="form-error" role="alert">{error || "找不到單位"}</p><button className="button" onClick={() => void reload()}>重新載入</button></section>;
  const assignManagerDialog = mode === "manage" && assigning && <AssignManagerDialog unitId={id} onClose={() => setAssigning(false)} onSaved={async () => { setAssigning(false); toast.success("已指定單位管理人"); await onMembershipChanged(); await reload(); }} />;
  const manageUnit = mode === "manage" && data.systemAdmin;
  const unitControls = manageUnit && <div className="unit-actions"><button className="button" onClick={() => setUnitAction("rename")}>修改單位名稱</button><button className="button" onClick={() => setUnitAction("department")}>設定系所組別</button><button className="button danger" disabled={data.members.length > 0} aria-describedby={data.members.length > 0 ? `unit-delete-help-${id}` : undefined} onClick={() => setUnitAction("delete")}>刪除單位</button></div>;
  const pending = data.allowlist.filter((entry) => !entry.userId);
  const summary = (meta: string, actions: React.ReactNode, extra?: React.ReactNode) => <div className="card unit-panel unit-summary"><div className="unit-heading"><div><h2><Building2 size={18} aria-hidden="true" />{data.unit.name}</h2><p>{data.unit.department ?? "未設定系所"} · {meta}</p></div><div className="unit-actions">{actions}{mode === "manage" && data.role === "ADMIN" && data.unit.status === "APPROVED" && <button className="button" onClick={() => setEditingProfile(true)}>編輯單位資訊</button>}</div></div><dl className="request-contact-details" aria-label="單位資訊"><div><dt>單位位置</dt><dd>{data.unit.location || "—"}</dd></div><div><dt>單位分機</dt><dd>{data.unit.extension || "—"}</dd></div><div><dt>指導老師</dt><dd>{data.unit.advisor || "—"}</dd></div></dl>{data.unit.note && <p className="unit-note unit-wrap">{data.unit.note}</p>}{manageUnit && data.members.length > 0 && <p id={`unit-delete-help-${id}`} className="field-help">需先移出所有成員，且單位沒有 DNS 解析值與待審核申請，才能刪除。</p>}{extra}</div>;
  const unitDialog = unitAction === "department" ? <ActionDialog title="設定系所組別" label="儲存系所組別" onClose={() => setUnitAction(null)} submit={async (form) => {
    await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "department", department: form.get("department") }));
    setUnitAction(null); toast.success("系所組別已更新");
    await onMembershipChanged(); await reload();
  }}><label>所屬系所／組別<Select name="department" aria-label="所屬系所／組別" defaultValue={data.unit.department ?? undefined} options={departmentOptions} /></label></ActionDialog> : unitAction && <ActionDialog title={unitAction === "rename" ? "修改單位名稱" : "刪除單位"} description={unitAction === "rename" ? "更新單位及目前 DNS 歸屬資料的名稱，歷史申請保留原名稱。" : `確定刪除「${data.unit.name}」？已結案申請及清查歷史會保留。`} label={unitAction === "rename" ? "儲存名稱" : "確認刪除"} tone={unitAction === "delete" ? "danger" : "primary"} onClose={() => setUnitAction(null)} submit={async (form) => {
    await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", unitAction === "rename" ? { action: "rename", name: form.get("name") } : { action: "delete" }));
    const renamed = unitAction === "rename";
    setUnitAction(null); toast.success(renamed ? "單位名稱已更新" : "單位已刪除");
    await onMembershipChanged(); if (renamed) await reload();
  }}>{unitAction === "rename" && <label>單位名稱<input name="name" required maxLength={100} defaultValue={data.unit.name} /></label>}</ActionDialog>;
  if (data.unit.status !== "APPROVED") return <section className="unit-detail">{summary(statusLabels[data.unit.status], unitControls, <p role="status" className="field-help">此單位未啟用，無法加入或申請 DNS。</p>)}{unitDialog}</section>;
  const records = data.records.filter((record) => matchesDnsRecord(query, record.recordName, record.zoneName, [record.recordType, record.content, record.purpose]));
  return <section className="unit-detail">{mode === "dns" ? summary(unitRoleLabels[workspace.active?.role ?? "EDITOR"], <div className="unit-actions">{data.canApply && <Link className="button primary" href="/requests/new">申請 DNS</Link>}<Link className="button" href="/requests/history">申請紀錄</Link></div>) : summary(`${statusLabels.APPROVED}${pending.length ? ` · ${pending.length} 位待加入` : ""}`, unitControls)}{unitDialog}{editingProfile && <ActionDialog title="編輯單位資訊" label="儲存單位資訊" onClose={() => setEditingProfile(false)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "profile", location: form.get("location"), extension: form.get("extension"), advisor: form.get("advisor") })); setEditingProfile(false); toast.success("單位資訊已更新"); await reload(); }}><UnitProfileFields unit={data.unit} /></ActionDialog>}{(mode === "dns" || data.systemAdmin) && <div className="card unit-panel"><div className="unit-heading"><div><h2>DNS 紀錄</h2><p>{data.records.length} 筆目前有效的 DNS{mode === "manage" ? " · 僅供查看" : ""}</p></div><button className="button" aria-label="重新載入 DNS" onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" /></button></div><div className="filter-input unit-search"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }} placeholder="搜尋名稱、類型、解析內容或用途" aria-label="搜尋 DNS" />{query && <button type="button" className="search-clear" aria-label="清除搜尋" onClick={() => setQuery("")}><X size={15} /></button>}</div>
    <ScrollRegion label="單位 DNS 紀錄" className="unit-record-scroll"><table className="unit-table"><thead><tr><th scope="col">名稱／類型</th><th scope="col">解析內容</th><th scope="col">用途</th>{mode === "dns" && <th scope="col">操作</th>}</tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.recordName}</strong><small>{record.recordType} · TTL {record.ttl}s{record.disabled ? " · 已停用" : ""}</small></td><td><code>{record.content}</code></td><td>{record.purpose || "—"}</td>{mode === "dns" && <td><div className="unit-actions unit-row-actions"><button className="button compact" onClick={() => setInspection(record)}>清查</button>{data.canApply && ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"].includes(record.recordType) && <><button className="button compact" onClick={() => setChange(record)}>申請變更</button><button className="button compact danger" onClick={() => setDeletion(record)}>申請刪除</button></>}</div></td>}</tr>)}</tbody></table></ScrollRegion>
    {data.recordsError && <p className="form-error" role="alert">{data.recordsError}</p>}
    {!records.length && !data.recordsError && <EmptyState title={query ? "沒有符合條件的 DNS" : "尚無單位 DNS"} />}</div>}
    {mode === "manage" && data.role === "ADMIN" && <div className="card unit-panel"><div className="unit-heading"><h2><Users size={18} aria-hidden="true" />使用者管理</h2><div className="unit-actions">{mode === "manage" && data.systemAdmin && <button className="button" onClick={() => setAssigning(true)}>指定單位管理人</button>}{data.role === "ADMIN" && <button className="button" onClick={() => setAllowlist({})}>新增使用者</button>}</div></div><p className="description">成員可清查及送出申請；管理員另可管理成員。</p>{!data.members.length && <p className="field-help unit-empty">尚無已登入的成員。</p>}<ul className="unit-members">{data.members.map((member) => <li key={member.userId}><span><strong>{member.label}</strong><small>{member.studentId && member.studentId !== member.label ? `${member.studentId} · ` : ""}{unitRoleLabels[member.role]}{member.disabled ? " · 帳號已停用" : ""}</small></span>{data.role === "ADMIN" && <button className="button" aria-label={`管理 ${member.studentId || member.label} 的單位權限`} onClick={() => setManage(member)}>管理權限</button>}</li>)}</ul>{pending.length > 0 && <section className="unit-pending" aria-labelledby={`unit-pending-${id}`}><h3 id={`unit-pending-${id}`}>待加入的使用者</h3><p className="description">以下使用者尚未登入，登入後會依指定角色自動加入單位。</p><ul className="unit-members">{pending.map((entry) => <li key={entry.studentId}><span><strong>{entry.studentId}</strong><small>{`${unitRoleLabels[entry.role ?? "EDITOR"]} · 等待使用者登入`}</small></span><button className="button" aria-label={`移除使用者 ${entry.studentId}`} onClick={() => setAllowlist({ studentId: entry.studentId })}>移除</button></li>)}</ul></section>}</div>}
    {allowlist && <ActionDialog title={allowlist.studentId ? "移除使用者" : "新增使用者"} description={allowlist.studentId ? `取消使用者 ${allowlist.studentId} 加入本單位。之後若要加入，需由管理員重新新增。` : "可預先加入尚未註冊的使用者。"} label={allowlist.studentId ? "確認移除" : "新增使用者"} tone={allowlist.studentId ? "danger" : "primary"} onClose={() => setAllowlist(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}`, jsonRequest("PATCH", { action: "allowlist", studentId: allowlist.studentId ?? form.get("studentId"), remove: !!allowlist.studentId })); setAllowlist(null); toast.success("使用者設定已更新"); await onMembershipChanged(); await reload(); }}>{(error, errorId) => !allowlist.studentId && <label>學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label>}</ActionDialog>}
    {assignManagerDialog}
    {inspection && <ActionDialog drafts={inspectionDrafts} draftKey={JSON.stringify([id, inspection.id, inspection.expectedUpdatedAt, inspection.expectedHash])} title="DNS 清查" label="儲存並記錄清查" onClose={() => setInspection(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}/inspections`, jsonRequest("POST", { recordId: inspection.id, expectedHash: inspection.expectedHash, note: form.get("note"), ownership: { expectedUpdatedAt: inspection.expectedUpdatedAt, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantExtension: form.get("applicantExtension"), purpose: form.get("purpose") } })); setInspection(null); toast.success("清查已記錄"); await reload(); }}><p><strong>{inspection.recordName}</strong> · {inspection.recordType}</p><code className="unit-wrap">{inspection.content}</code><UnitRecordFields record={inspection} /><label>清查備註<textarea name="note" maxLength={1000} rows={3} /></label><section className="unit-inspection-history" aria-label="清查歷史"><h3>清查歷史</h3>{inspection.inspections?.length ? <ul>{inspection.inspections.map((entry) => <li key={entry.id}><p><time dateTime={entry.inspectedAt}>{new Date(entry.inspectedAt).toLocaleString("zh-TW")}</time> · {entry.inspectorName}</p><p className="unit-wrap">{inspectionEventLabel(entry)}</p><p className="unit-wrap">{entry.note || "無備註"}</p></li>)}</ul> : <p>尚無清查紀錄</p>}</section></ActionDialog>}
    {deletion && <ActionDialog title="申請刪除 DNS" description="核准後才會刪除此解析值，其餘解析值保留。" label="送出刪除申請" onClose={() => setDeletion(null)} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(id)}/changes`, jsonRequest("POST", { operation: "DELETE", recordId: deletion.id, expectedHash: deletion.expectedHash, purpose: form.get("purpose") })); setDeletion(null); toast.success("刪除申請已送出，等待管理員審核"); await reload(); }}><p><strong>{deletion.recordName}</strong> · {deletion.recordType}</p><code className="unit-wrap">{deletion.content}</code><UnitRecordContact record={deletion} /><label>刪除原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>}
    {change && <ChangeDialog unitId={id} record={change} onClose={() => setChange(null)} onSaved={async () => { setChange(null); toast.success("變更申請已送出，核准前不會修改 DNS"); await reload(); }} />}
    {manage && <ManageDialog unitId={id} target={manage} onClose={() => setManage(null)} onSaved={async () => { setManage(null); toast.success("使用者權限已更新"); await onMembershipChanged(); await reload(); }} />}
  </section>;
}

function UnitRecordContact({ record }: { record: UnitRecord }) {
  return <dl className="request-contact-details"><div><dt>申請人</dt><dd>{record.applicantName || "—"}</dd></div><div><dt>申請人電子郵件</dt><dd>{record.applicantEmail || "—"}</dd></div><div><dt>申請單位／分機</dt><dd>{record.applicantUnit || "—"}／{record.applicantExtension || "—"}</dd></div><div><dt>DNS 用途</dt><dd className="unit-wrap">{record.purpose || "—"}</dd></div></dl>;
}

function ChangeDialog({ unitId, record, onClose, onSaved }: { unitId: string; record: UnitRecord; onClose: () => void; onSaved: () => Promise<void> }) {
  return <ActionDialog title="申請變更 DNS" description="可修改解析內容、TTL 與聯絡／用途資料，核准後生效。TTL 會套用到同名稱、同類型的所有解析值。" onClose={onClose} submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}/changes`, jsonRequest("POST", { recordId: record.id, content: form.get("content"), ttl: Number(form.get("ttl")), purpose: form.get("purpose"), expectedHash: record.expectedHash, ownership: { expectedUpdatedAt: record.expectedUpdatedAt, applicantName: form.get("applicantName"), applicantEmail: form.get("applicantEmail"), applicantExtension: form.get("applicantExtension"), purpose: form.get("recordPurpose") } })); await onSaved(); }} label="送出變更申請"><p><strong>{record.recordName}</strong> · {record.recordType}</p><p>原解析內容：<code className="unit-wrap">{record.content}</code></p><label>TTL（秒）<input name="ttl" type="number" required min={30} max={2147483647} step={1} defaultValue={record.ttl} /></label><label>新解析內容<textarea name="content" defaultValue={record.content} required maxLength={65535} rows={3} spellCheck={false} autoCapitalize="none" /></label><UnitRecordFields record={record} purposeName="recordPurpose" /><label>變更原因<textarea name="purpose" required maxLength={1000} rows={3} /></label></ActionDialog>;
}
function AssignManagerDialog({ unitId, onClose, onSaved }: { unitId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const helpId = useId();
  return <ActionDialog title="指定單位管理人" description="可指定尚未註冊的使用者，首次登入後自動取得本單位管理權限。" onClose={onClose} label="指定管理人" submit={async (form) => { await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "assign-manager", studentId: form.get("studentId") })); await onSaved(); }}>{(error, errorId) => <><label>管理人學號<input name="studentId" required maxLength={100} autoComplete="off" spellCheck={false} aria-invalid={!!error} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} /></label><p id={helpId} className="field-help">尚未註冊也可先指定。</p></>}</ActionDialog>;
}
function ManageDialog({ unitId, target, onClose, onSaved }: { unitId: string; target: Member; onClose: () => void; onSaved: () => Promise<void> }) {
  const [choice, setChoice] = useState<string>(target.role);
  const removing = choice === "REMOVE";
  return <ActionDialog title={`管理使用者 · ${target.label}`} description="單位須保留至少一位管理員；移出後需由管理員重新新增。" onClose={onClose} label={removing ? "確認移出單位" : "更新角色"} tone={removing ? "danger" : "primary"} submit={async (form) => { const role = form.get("role"); await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: "member", userId: target.userId, role: role === "REMOVE" ? null : role })); await onSaved(); }}><label>使用者角色<Select name="role" aria-label="使用者角色" value={choice} onChange={setChoice} options={[...Object.entries(unitRoleLabels).map(([value, label]) => ({ value, label })), { value: "REMOVE", label: "移出單位" }]} /></label></ActionDialog>;
}
function ActionDialog({ drafts, draftKey, title, description, children, label, tone = "primary", submit, onClose }: { drafts?: FormDrafts; draftKey?: string; title: string; description?: string; children?: React.ReactNode | ((error: string, errorId: string) => React.ReactNode); label: string; tone?: "primary" | "danger"; submit: (form: FormData) => Promise<void>; onClose: () => void }) {
  const [pending, setPending] = useState(false); const sending = useRef(false);
  const [error, setError] = useState(""); const errorRef = useRef<HTMLParagraphElement>(null);
  const errorId = useId();
  const { attachForm, onChange: captureDraft, clear: clearDraft } = useFormDraft(drafts, draftKey);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title={title} description={description} pending={pending} onClose={onClose}><form ref={attachForm} onChange={captureDraft} onSubmit={async (event) => { event.preventDefault(); if (sending.current) return; const form = new FormData(event.currentTarget); sending.current = true; setPending(true); setError(""); try { await submit(form); clearDraft(); } catch (caught) { setError(caught instanceof Error ? caught.message : "操作未完成，請重試。"); } finally { sending.current = false; setPending(false); } }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{typeof children === "function" ? children(error, errorId) : children}{error && <p id={errorId} className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}</div><div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} label={label} tone={tone} /></div></fieldset></form></Dialog>;
}

function UnitProfileFields({ unit }: { unit?: { location?: string; extension?: string; advisor?: string } }) {
  return <><label>單位位置（選填）<input name="location" defaultValue={unit?.location ?? ""} maxLength={100} placeholder="例如 E1-213" /></label><label>單位分機（選填）<input name="extension" defaultValue={unit?.extension ?? ""} inputMode="numeric" pattern="[0-9]{1,10}" maxLength={10} title="請填入 1–10 位數字" placeholder="例如 1234" /></label><label>指導老師（選填）<input name="advisor" defaultValue={unit?.advisor ?? ""} maxLength={100} /></label></>;
}
