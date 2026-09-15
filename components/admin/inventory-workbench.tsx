"use client";
import { PersonName } from "@/components/ui/person-name";
import { useEffect, useMemo, useRef, useState } from "react";
import { ClipboardCheck, RefreshCw, Search, X } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { EmptyState } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { OwnershipDialog } from "@/components/records/ownership-dialog";
import type { InventoryRecord } from "@/lib/inventory/types";
import { groupInventory, type InventoryGroup, type InventoryFilter } from "@/lib/inventory/view";
import { AssignInspectionDialog } from "@/components/workflows/inspections";
import { InventoryViews } from "@/components/admin/inventory-views";
import type { ViewMode } from "@/components/records/model";
import { isRecordView, recordViews } from "@/components/records/view-options";

const inventoryViewStorageKey = "aegis-inventory-view";
const inventoryViews = [{ key: "inspection" as const, label: "清查列表", icon: ClipboardCheck }, ...recordViews];
export function InventoryWorkbench({ systemAdmin = false }: { systemAdmin?: boolean }) {
  const [assigning, setAssigning] = useState<InventoryRecord | null>(null);
  const [view, setView] = useState<ViewMode | "inspection">("inspection");
  const { data, loading, error, reload } = useResource<{ records: InventoryRecord[] }>("/api/inventory");
  const [query, setQuery] = useState(""); const [group, setGroup] = useState<InventoryGroup>("applicantUnit"); const [status, setStatus] = useState<InventoryFilter>("all");
  const [dialog, setDialog] = useState<{ record: InventoryRecord; inspection: boolean } | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(""); searchInput.current?.focus(); };
  const groups = useMemo(() => groupInventory(data?.records || [], group, status, query), [data, group, query, status]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(inventoryViewStorageKey);
      if (saved === "inspection" || isRecordView(saved)) setView(saved);
    } catch { /* Browser preferences are optional. */ }
  }, []);
  function selectView(next: ViewMode | "inspection") {
    setView(next);
    try { localStorage.setItem(inventoryViewStorageKey, next); } catch { /* Keep the view in memory. */ }
  }
  return <><div className="admin-toolbar card"><div className="filter-input"><Search size={16} aria-hidden="true" /><input ref={searchInput} type="search" onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); clearSearch(); } }} aria-label="搜尋 DNS 清查" placeholder="搜尋名稱、IP、申請人、單位或用途" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" className="search-clear" aria-label="清除清查搜尋" onClick={clearSearch}><X size={15} /></button>}</div><label>分組<select value={group} onChange={(e) => setGroup(e.target.value as InventoryGroup)}><option value="applicantUnit">依單位</option><option value="applicantName">依申請人</option><option value="purpose">依用途</option><option value="zoneName">依網域</option></select></label><label>顯示<select value={status} onChange={(e) => setStatus(e.target.value as InventoryFilter)}><option value="all">全部紀錄</option><option value="unreviewed">尚未清查</option><option value="reviewed">已有清查紀錄</option><option value="missing">歸屬資料未完整</option></select></label><button className="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} className={loading ? "spin" : ""} />重新整理</button></div>
    <div className="record-toolbar card inventory-view-toolbar"><span className="view-switcher-label">檢視模式</span><div className="view-switcher" role="group" aria-label="DNS 清查檢視模式">{inventoryViews.map(({ key, label, icon: Icon }) => <button type="button" key={key} className={view === key ? "active" : ""} onClick={() => selectView(key)} aria-pressed={view === key} title={label}><Icon size={15} aria-hidden="true" /><span>{label}</span></button>)}</div></div>
    <p className="record-results" role="status">{loading ? "正在取得各網域的 DNS 紀錄…" : error ? "無法取得 DNS 清查紀錄" : `顯示 ${groups.reduce((n, [, records]) => n + records.length, 0)} / ${data?.records.length ?? 0} 筆解析值 · ${groups.length} 組`}</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <div className="card inventory-loading" aria-hidden="true"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : !groups.length ? <EmptyState title={data?.records.length ? "沒有符合條件的 DNS 紀錄" : "目前沒有可清查的 DNS 紀錄"} description={data?.records.length ? "可清除搜尋或切換顯示條件。" : "確認可管理的網域已有 DNS 紀錄後，再重新整理。"} action={!!data?.records.length && <button type="button" className="button" onClick={() => { clearSearch(); setStatus("all"); }}>顯示全部</button>} /> : groups.map(([key, records]) => <section className="card inventory-group" key={key}><h2>{key}<span>{records.length} 筆</span></h2>{view !== "inspection" ? <InventoryViews records={records} view={view} open={(record) => setDialog({ record, inspection: true })} /> : records.map((record) => <article className="inventory-row" key={record.ownership.id}><div><strong>{record.recordName}</strong><code>{record.recordType} · {record.content}</code><span>{record.ownership.applicantName || "未填申請人"} · {record.ownership.applicantUnit || "未填單位"}</span><p>{record.ownership.purpose || "未填用途"}</p></div><div className="inspection-last">{record.ownership.inspections[0] ? <><strong>{new Date(record.ownership.inspections[0].inspectedAt).toLocaleDateString("zh-TW")}</strong><PersonName name={record.ownership.inspections[0].inspectorName} email={record.ownership.inspections[0].inspectorEmail} studentId={record.ownership.inspections[0].inspectorStudentId} /></> : <span>尚未清查</span>}{record.disabled && <span>DNS 已停用</span>}</div><div className="page-actions">{systemAdmin && <button className="button" onClick={() => setAssigning(record)}>指派確認</button>}<button className="button" onClick={() => setDialog({ record, inspection: false })}>歸屬／歷史</button><button className="button primary" onClick={() => setDialog({ record, inspection: true })}>記錄清查</button></div></article>)}</section>)}
    {assigning && <AssignInspectionDialog record={assigning} onClose={() => setAssigning(null)} />}
    {dialog && <OwnershipDialog {...dialog} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />}
  </>;
}
