"use client";
import { PersonName } from "@/components/ui/person-name";
import { useId, useMemo, useRef, useState } from "react";
import { RefreshCw, Search, X } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { EmptyState } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { OwnershipDialog } from "@/components/records/ownership-dialog";
import type { InventoryRecord } from "@/lib/inventory/types";
import { groupInventory, type InventoryFilter } from "@/lib/inventory/view";
import { Select } from "@/components/ui/select";

export function InventoryWorkbench({ systemAdmin = false, canDeleteInspections = false }: { systemAdmin?: boolean; canDeleteInspections?: boolean }) {
  const [domain, setDomain] = useState("");
  const tabsId = useId();
  const { data, loading, error, reload } = useResource<{ records: InventoryRecord[] }>("/api/inventory");
  const [query, setQuery] = useState(""); const [status, setStatus] = useState<InventoryFilter>("all");
  const [dialog, setDialog] = useState<InventoryRecord | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const clearSearch = () => { setQuery(""); searchInput.current?.focus(); };
  const domains = useMemo(() => [...new Set((data?.records ?? []).map((record) => record.zoneName))].sort((a, b) => a.localeCompare(b)), [data]);
  const activeDomain = domains.includes(domain) ? domain : domains[0];
  const domainRecords = useMemo(() => (data?.records ?? []).filter((record) => record.zoneName === activeDomain), [data, activeDomain]);
  const groups = useMemo(() => groupInventory(domainRecords, "zoneName", status, query), [domainRecords, query, status]);
  return <><div className="admin-toolbar inventory-toolbar"><div className="filter-input"><Search size={16} aria-hidden="true" /><input ref={searchInput} type="search" onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); clearSearch(); } }} aria-label="搜尋 DNS 清查" placeholder="搜尋名稱、IP、申請人、單位或用途" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" className="search-clear" aria-label="清除清查搜尋" onClick={clearSearch}><X size={15} /></button>}</div><label>顯示<Select aria-label="清查顯示篩選" value={status} onChange={(value) => setStatus(value as InventoryFilter)} options={[{ value: "all", label: "全部紀錄" }, { value: "unreviewed", label: "尚未清查" }, { value: "reviewed", label: "已有清查紀錄" }, { value: "missing", label: "歸屬資料未完整" }]} /></label><button className="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} className={loading ? "spin" : ""} />重新整理</button></div>
    {!!domains.length && <div className="zone-category-tabs inventory-domain-tabs" role="tablist" aria-label="清查網域">{domains.map((name, index) => <button type="button" role="tab" key={name} id={`${tabsId}-tab-${index}`} aria-controls={`${tabsId}-panel`} aria-selected={activeDomain === name} tabIndex={activeDomain === name ? 0 : -1} onClick={() => setDomain(name)} onKeyDown={(event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % domains.length;
      else if (event.key === "ArrowLeft") next = (index + domains.length - 1) % domains.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = domains.length - 1;
      else return;
      event.preventDefault(); setDomain(domains[next]); document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}>{name}</button>)}</div>}
    <div id={`${tabsId}-panel`} role={domains.length ? "tabpanel" : undefined} aria-labelledby={domains.length ? `${tabsId}-tab-${domains.indexOf(activeDomain)}` : undefined} tabIndex={domains.length ? 0 : undefined}>
    <p className="record-results" role="status">{loading ? "正在取得各網域的 DNS 紀錄…" : error ? "無法取得 DNS 清查紀錄" : `顯示 ${groups.reduce((n, [, records]) => n + records.length, 0)} / ${domainRecords.length} 筆解析值`}</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <div className="card inventory-loading" role="status" aria-label="正在載入 DNS 清查紀錄"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div> : !groups.length ? <EmptyState title={data?.records.length ? "沒有符合條件的 DNS 紀錄" : "目前沒有可清查的 DNS 紀錄"} description={data?.records.length ? "可清除搜尋或切換顯示條件。" : "確認可管理的網域已有 DNS 紀錄後，再重新整理。"} action={!!data?.records.length && <button type="button" className="button" onClick={() => { clearSearch(); setStatus("all"); }}>顯示全部</button>} /> : groups.map(([key, records]) => <section className="card inventory-group" key={key}><h2>{key}<span>{records.length} 筆</span></h2>{records.map((record) => <article className="inventory-row" key={record.ownership.id}><div><strong>{record.recordName}</strong><code>{record.recordType} · {record.content}</code><span>{record.ownership.applicantName || "未填申請人"} · {record.ownership.applicantUnit || "未填單位"}</span><p>{record.ownership.purpose || "未填用途"}</p></div><div className="inspection-last">{record.ownership.inspections[0] ? <><strong>{new Date(record.ownership.inspections[0].inspectedAt).toLocaleDateString("zh-TW")}</strong><PersonName name={record.ownership.inspections[0].inspectorName} email={record.ownership.inspections[0].inspectorEmail} studentId={record.ownership.inspections[0].inspectorStudentId} /></> : <span>尚未清查</span>}{record.disabled && <span>DNS 已停用</span>}</div><div className="page-actions"><button className="button" aria-label={`清查 ${record.recordName} ${record.content}`} onClick={() => setDialog(record)}>清查</button></div></article>)}</section>)}
    </div>
    {dialog && <OwnershipDialog canDeleteInspections={canDeleteInspections} systemAdmin={systemAdmin} record={dialog} inspection onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />}
  </>;
}
