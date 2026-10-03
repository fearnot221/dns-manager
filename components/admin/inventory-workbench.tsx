"use client";
import type { FormDrafts } from "@/lib/client/form-draft";
import { PersonName } from "@/components/ui/person-name";
import { useId, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Search, X } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { EmptyState, LoadingPanel } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { OwnershipDialog } from "@/components/records/ownership-dialog";
import type { InventoryRecord } from "@/lib/inventory/types";
import { compareInventoryDomains, groupInventory, type InventoryFilter } from "@/lib/inventory/view";
import { HistoryDialog } from "@/components/records/history-dialog";
import { RecordDialog } from "@/components/records/record-dialog";
import type { DialogState, HashedRRSet } from "@/components/records/model";
import { Select } from "@/components/ui/select";

export function InventoryWorkbench({ systemAdmin = false, canDeleteInspections = false, zoneName, onRecordsChanged }: { systemAdmin?: boolean; canDeleteInspections?: boolean; zoneName?: string; onRecordsChanged?: () => Promise<void> }) {
  const [inspectionDrafts] = useState<FormDrafts>(() => new Map());
  const [domain, setDomain] = useState("");
  const tabsId = useId();
  const { data, loading, error, reload } = useResource<{ records?: InventoryRecord[]; rrsets?: HashedRRSet[]; permission?: string }>(zoneName ? `/api/zones/${encodeURIComponent(zoneName)}/records` : "/api/inventory");
  const records = useMemo(() => zoneName ? (data?.rrsets ?? []).flatMap((rrset) => rrset.records.flatMap((record) => record.ownership ? [{ zoneName, recordName: rrset.name, recordType: rrset.type, content: record.content, ttl: rrset.ttl, disabled: record.disabled, ownership: record.ownership }] : [])) : data?.records ?? [], [data, zoneName]);
  const [history, setHistory] = useState<{ name?: string; type?: string } | null>(null);
  const [mutation, setMutation] = useState<DialogState | null>(null);
  const canManage = !!zoneName && ["ADMIN", "SUPER_ADMIN"].includes(data?.permission ?? "") && !loading && !error;
  function recordActions(record: InventoryRecord) {
    const rrset = data?.rrsets?.find((item) => item.name === record.recordName && item.type === record.recordType);
    if (!canManage || !rrset) return null;
    const apexProtected = ["SOA", "NS"].includes(rrset.type) && rrset.name.toLowerCase() === zoneName?.toLowerCase();
    return <><button className="button compact" aria-label={`編輯 ${record.recordName} ${record.recordType} 紀錄組`} onClick={() => setMutation({ mode: "edit", rrset })}>編輯紀錄組</button>{(!apexProtected || data?.permission === "SUPER_ADMIN") && <button className="button compact danger" aria-label={`刪除 ${record.recordName} ${record.content}`} onClick={() => setMutation({ mode: "delete", rrset: { ...rrset, records: rrset.records.filter((value) => value.content === record.content) } })}>刪除解析值</button>}</>;
  }
  async function refreshRecords() { await reload(); await onRecordsChanged?.(); }
  const [recordType, setRecordType] = useState("ALL");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState<InventoryFilter>("all");
  const [dialog, setDialog] = useState<InventoryRecord | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(""); searchInput.current?.focus(); };
  const domains = useMemo(() => [...new Set(records.map((record) => record.zoneName))].sort(compareInventoryDomains), [records]);
  const activeDomain = zoneName ?? (domains.includes(domain) ? domain : domains[0]);
  const domainRecords = useMemo(() => records.filter((record) => record.zoneName === activeDomain), [records, activeDomain]);
  const groups = useMemo(() => groupInventory(domainRecords.filter((record) => recordType === "ALL" || record.recordType === recordType), "zoneName", status, query), [domainRecords, query, status, recordType]);
  return <><div className="admin-toolbar inventory-toolbar"><div className="filter-input"><Search size={16} aria-hidden="true" /><input ref={searchInput} type="search" onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); clearSearch(); } }} aria-label={zoneName ? "搜尋 DNS 紀錄" : "搜尋 DNS 清查"} placeholder="搜尋名稱、IP、申請人、單位或用途" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" className="search-clear" aria-label="清除清查搜尋" onClick={clearSearch}><X size={15} /></button>}</div>{zoneName && <Select aria-label="篩選紀錄類型" value={recordType} onChange={setRecordType} options={[{ value: "ALL", label: "所有類型" }, ...[...new Set(records.map((record) => record.recordType))].sort().map((type) => ({ value: type, label: type }))]} />}<label>顯示<Select aria-label="清查顯示篩選" value={status} onChange={(value) => setStatus(value as InventoryFilter)} options={[{ value: "all", label: "全部紀錄" }, { value: "unreviewed", label: "尚未清查" }, { value: "reviewed", label: "已有清查紀錄" }, { value: "missing", label: "歸屬資料未完整" }]} /></label><button className="button" disabled={loading} onClick={() => void refreshRecords()}><RefreshCw size={15} className={loading ? "spin" : ""} />重新整理</button>{zoneName && <button className="button" onClick={() => setHistory({})}>DNS 歷程（含已刪除）</button>}{canManage && <button className="button primary" onClick={() => setMutation({ mode: "add" })}><Plus size={15} aria-hidden="true" />新增紀錄</button>}</div>
    {!zoneName && !!domains.length && <div className="zone-category-tabs inventory-domain-tabs tab-strip" role="tablist" aria-label="清查網域">{domains.map((name, index) => <button type="button" role="tab" key={name} id={`${tabsId}-tab-${index}`} aria-controls={`${tabsId}-panel`} aria-selected={activeDomain === name} tabIndex={activeDomain === name ? 0 : -1} onClick={() => setDomain(name)} onKeyDown={(event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % domains.length;
      else if (event.key === "ArrowLeft") next = (index + domains.length - 1) % domains.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = domains.length - 1;
      else return;
      event.preventDefault(); setDomain(domains[next]); document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}>{name}</button>)}</div>}
    <div id={`${tabsId}-panel`} role={!zoneName && domains.length ? "tabpanel" : undefined} aria-labelledby={!zoneName && domains.length ? `${tabsId}-tab-${domains.indexOf(activeDomain)}` : undefined} tabIndex={!zoneName && domains.length ? 0 : undefined}>
    <p className="record-results" role="status">{loading && !data ? "正在取得 DNS 紀錄…" : error ? "無法取得 DNS 清查紀錄" : `顯示 ${groups.reduce((n, [, records]) => n + records.length, 0)} / ${domainRecords.length} 筆解析值`}</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading && !data ? <LoadingPanel label="正在載入 DNS 清查紀錄" /> : !groups.length ? <EmptyState title={records.length ? "沒有符合條件的 DNS 紀錄" : zoneName ? "這個網域尚無 DNS 紀錄" : "目前沒有可清查的 DNS 紀錄"} description={records.length ? "可清除搜尋或切換顯示條件。" : zoneName ? "可透過上方新增紀錄建立 DNS。" : "確認可管理的網域已有 DNS 紀錄後，再重新整理。"} action={!!records.length && <button type="button" className="button" onClick={() => { clearSearch(); setStatus("all"); setRecordType("ALL"); }}>顯示全部</button>} /> : groups.map(([key, records]) => <section className="card inventory-group" key={key}><h2>{key}<span>{records.length} 筆</span></h2>{records.map((record) => <article className={zoneName ? "inventory-row inventory-row-managed" : "inventory-row"} key={record.ownership.id}><div><strong>{record.recordName}</strong><code>{record.recordType} · {record.content} · TTL {record.ttl}s</code><span>{record.ownership.applicantName || "未填申請人"} · {record.ownership.applicantUnit || "未填單位"}</span><p>{record.ownership.purpose || "未填用途"}</p></div><div className="inspection-last">{record.ownership.inspections[0] ? <><strong>{new Date(record.ownership.inspections[0].inspectedAt).toLocaleDateString("zh-TW")}</strong><PersonName name={record.ownership.inspections[0].inspectorName} email={record.ownership.inspections[0].inspectorEmail} studentId={record.ownership.inspections[0].inspectorStudentId} /></> : <span>尚未清查</span>}{record.disabled && <span>DNS 已停用</span>}</div><div className="page-actions inventory-actions"><button className="button compact" aria-label={`清查 ${record.recordName} ${record.content}`} onClick={() => setDialog(record)}>清查</button>{zoneName && <button className="button compact" aria-label={`歷程 ${record.recordName} ${record.recordType}`} onClick={() => setHistory({ name: record.recordName, type: record.recordType })}>歷程</button>}{recordActions(record)}</div></article>)}</section>)}
    </div>
    {history && zoneName && <HistoryDialog zone={zoneName} name={history.name} type={history.type} onClose={() => setHistory(null)} />}
    {mutation && zoneName && <RecordDialog zone={zoneName} dialog={mutation} onClose={() => setMutation(null)} onSaved={async () => { setMutation(null); await refreshRecords(); }} />}
    {dialog && <OwnershipDialog drafts={inspectionDrafts} canDeleteInspections={canDeleteInspections} systemAdmin={systemAdmin} record={dialog} inspection onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />}
  </>;
}
