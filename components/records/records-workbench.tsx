"use client";

import { Plus, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, EmptyState, LoadingRows } from "@/components/ui";
import { RECORD_TYPES } from "@/lib/dns/types";

import { protectedTypes, type DialogState, type HashedRRSet, type RecordViewProps, type ViewMode } from "./model";
import { RecordTable, RecordList, GroupedRecords } from "./record-views";
import { RecordGrid } from "./record-board";
import type { InventoryRecord } from "@/lib/inventory/types";
import { OwnershipDialog } from "./ownership-dialog";
import { RecordDialog } from "./record-dialog";
import { isRecordView, recordViews } from "./view-options";
import { Select } from "@/components/ui/select";

import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";

const emptyRecords: HashedRRSet[] = [];
const viewStorageKey = "aegis-record-view";
export function RecordsWorkbench({ zoneName }: { zoneName: string }) {
  const { data, loading, error, reload: load } = useResource<{ rrsets: HashedRRSet[]; permission: string }>(`/api/zones/${encodeURIComponent(zoneName)}/records`);
  const rrsets = data?.rrsets ?? emptyRecords;
  const permission = data?.permission ?? "";
  const searchInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("ALL");
  const [view, setView] = useState<ViewMode>("table");
  const [ownership, setOwnership] = useState<InventoryRecord | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(viewStorageKey);
      if (isRecordView(saved)) setView(saved);
    } catch { /* Browser preferences are optional. */ }
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !target.isContentEditable && !target.closest("dialog") && !["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) {
        event.preventDefault();
        searchInput.current?.focus();
      }
    };
    addEventListener("keydown", focusSearch);
    return () => removeEventListener("keydown", focusSearch);
  }, []);

  const availableTypes = useMemo(
    () => RECORD_TYPES.filter((recordType) => rrsets.some((rrset) => rrset.type === recordType)),
    [rrsets],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rrsets.filter((rrset) => {
      if (type !== "ALL" && rrset.type !== type) return false;
      const searchable = `${rrset.name} ${rrset.type} ${rrset.records.map((record) => record.content).join(" ")}`.toLowerCase();
      return searchable.includes(needle);
    });
  }, [rrsets, query, type]);

  const canCreate = ["EDITOR", "ADMIN", "SUPER_ADMIN"].includes(permission);
  const canMutate = (rrset: HashedRRSet) => canCreate && (permission !== "EDITOR" || !protectedTypes.has(rrset.type));
  const valueCount = rrsets.reduce((total, rrset) => total + rrset.records.length, 0);
  const filtersActive = Boolean(query.trim()) || type !== "ALL";

  function selectView(next: ViewMode) {
    setView(next);
    try { localStorage.setItem(viewStorageKey, next); } catch { /* Keep the view in memory. */ }
  }
  function clearFilters() { setQuery(""); setType("ALL"); }
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); toast.success("已複製"); }
    catch { toast.error("無法複製，請手動選取內容。"); }
  }

  const viewProps: RecordViewProps = { rrsets: filtered, zone: zoneName, canMutate, copy, open: setDialog, openOwnership: setOwnership };

  return (
    <>
      <div className="record-summary">
        <div><strong>{rrsets.length}</strong><span>紀錄組</span></div>
        <div><strong>{valueCount}</strong><span>解析值</span></div>
        <div><strong>{availableTypes.length}</strong><span>類型</span></div>
        <div className="summary-permission"><Badge tone="blue">{({ SUPER_ADMIN: "系統管理員", ADMIN: "網域管理員", EDITOR: "編輯者", VIEWER: "唯讀" } as Record<string, string>)[permission] || "—"}</Badge></div>
      </div>

      <div className="record-toolbar card">
        <div className="filter-input record-search">
          <Search size={16} />
          <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋名稱、內容或類型" aria-label="搜尋 DNS 紀錄" />
          {query ? <button className="search-clear" onClick={() => setQuery("")} aria-label="清除搜尋"><XCircle size={15} /></button> : <kbd>/</kbd>}
        </div>
        <Select aria-label="篩選紀錄類型" value={type} onChange={setType} options={[{ value: "ALL", label: "所有類型" }, ...availableTypes.map((item) => ({ value: item, label: item }))]} />
        <div className="view-switcher" role="group" aria-label="檢視模式">
          {recordViews.map(({ key, label, icon: Icon }) => (
            <button key={key} className={view === key ? "active" : ""} onClick={() => selectView(key)} aria-pressed={view === key} title={label}>
              <Icon size={15} /><span>{label}</span>
            </button>
          ))}
        </div>
        {canCreate && <button className="button primary add-record" onClick={() => setDialog({ mode: "add" })}><Plus size={15} /> 新增紀錄</button>}
      </div>

      <div className="record-results" aria-live="polite">
        <span>{loading ? "讀取中…" : error ? "無法取得紀錄" : filtersActive ? `${filtered.length} / ${rrsets.length} 組紀錄` : `共 ${rrsets.length} 組紀錄`}</span>
        {filtersActive && <button onClick={clearFilters}>清除篩選</button>}
      </div>

      {error ? <ResourceError message={error} retry={load} /> : loading ? (
        <div className="card table-card"><table><tbody><LoadingRows columns={6} /></tbody></table></div>
      ) : filtered.length === 0 ? (
        <div className="card"><EmptyState title={filtersActive ? "沒有符合條件的紀錄" : "這個網域尚無紀錄"} description={filtersActive ? "試試其他名稱、內容或類型。" : "新增這個網域的第一筆 DNS 紀錄。"} action={filtersActive ? <button className="button" onClick={clearFilters}>清除篩選</button> : canCreate ? <button className="button primary" onClick={() => setDialog({ mode: "add" })}>新增紀錄</button> : undefined} /></div>
      ) : view === "table" ? <RecordTable {...viewProps} />
        : view === "list" ? <RecordList {...viewProps} />
          : view === "grid" ? <RecordGrid {...viewProps} />
          : <GroupedRecords {...viewProps} mode={view} />}

      {ownership && <OwnershipDialog record={ownership} onClose={() => setOwnership(null)} onSaved={async () => { setOwnership(null); await load(); }} />}
      {dialog && <RecordDialog zone={zoneName} dialog={dialog} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await load(); }} />}
    </>
  );
}
