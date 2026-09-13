"use client";

import { ChevronRight, Globe2, Search, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge, EmptyState, LoadingRows } from "@/components/ui";
import type { Zone } from "@/lib/dns/types";
import type { ZoneApplicationAccess } from "@/lib/requests/zone-access";
import { ApiError, apiRequest, jsonRequest } from "@/lib/client/api";
import { Dialog } from "@/components/ui/dialog";

import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { filterZones, zoneCategories, zoneCategory, type ZoneCategory } from "@/lib/dns/zone-category";

type ZoneRow = Omit<Zone, "rrsets"> & { recordCount: number; permission: string; applicationAccess: ZoneApplicationAccess };

const emptyZones: ZoneRow[] = [];

export function ZonesTable() {
  const { data, loading, error, reload: load } = useResource<{ zones: ZoneRow[] }>("/api/zones");
  const zones = data?.zones ?? emptyZones;
  const [overrides, setOverrides] = useState<Record<string, ZoneApplicationAccess>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [closing, setClosing] = useState<ZoneRow | null>(null);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");
  const [conflict, setConflict] = useState(false);
  const sending = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const [accessFilter, setAccessFilter] = useState("all");
  const accessFor = (zone: ZoneRow) => overrides[zone.id] ?? zone.applicationAccess;
  function refresh() {
    if (sending.current) return;
    setOverrides({}); setClosing(null); setFailure(""); setNotice(""); setConflict(false);
    void load();
  }
  async function saveAccess(zone: ZoneRow, enabled: boolean) {
    if (sending.current) return;
    sending.current = true;
    setPending(zone.id); setFailure(""); setNotice(""); setConflict(false);
    try {
      const result = await apiRequest<{ access: ZoneApplicationAccess }>(`/api/zones/${encodeURIComponent(zone.name)}/applications`, jsonRequest("PATCH", { enabled, expectedUpdatedAt: accessFor(zone).updatedAt }));
      setOverrides((previous) => ({ ...previous, [zone.id]: result.access }));
      setNotice(`${zone.name.replace(/\.$/, "")} 已${enabled ? "開放" : "暫停"}申請。`);
      setClosing(null);
    } catch (error) { setFailure(error instanceof Error ? error.message : "儲存失敗，請重試。"); setConflict(error instanceof ApiError && error.status === 409); }
    finally { sending.current = false; setPending(null); }
  }
  const [category, setCategory] = useState<ZoneCategory>("forward");
  const [queries, setQueries] = useState<Record<ZoneCategory, string>>({ forward: "", ipv4: "", ipv6: "" });
  const query = queries[category];
  const setQuery = (value: string) => setQueries((previous) => ({ ...previous, [category]: value }));
  const clearQuery = () => { setQuery(""); searchInput.current?.focus(); };
  const selected = zoneCategories.find((item) => item.id === category)!;
  const counts = useMemo(() => zones.reduce((result, zone) => { result[zoneCategory(zone.name)]++; return result; }, { forward: 0, ipv4: 0, ipv6: 0 }), [zones]);
  const rows = useMemo(
    () => filterZones(zones, category, query).filter((zone) => accessFilter === "all" || (overrides[zone.id] ?? zone.applicationAccess).enabled === (accessFilter === "open")),
    [zones, category, query, accessFilter, overrides],
  );

  return <>
    <p className="zone-access-hint">只開放需要提供申請的網域。暫停申請不會刪除 DNS，也不影響已送出的申請。</p>
    <div className="card table-card">
      <div className="zone-category-tabs" role="tablist" aria-label="網域類別">
        {zoneCategories.map((item, index) => <button key={item.id} type="button" role="tab" id={`zone-tab-${item.id}`} aria-controls="zone-category-panel" aria-selected={category === item.id} tabIndex={category === item.id ? 0 : -1} onClick={() => setCategory(item.id)} onKeyDown={(event) => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % zoneCategories.length;
          else if (event.key === "ArrowLeft") next = (index + zoneCategories.length - 1) % zoneCategories.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = zoneCategories.length - 1;
          else return;
          event.preventDefault(); setCategory(zoneCategories[next].id);
          document.getElementById(`zone-tab-${zoneCategories[next].id}`)?.focus();
        }}><span><strong>{item.label}</strong><small>{item.suffix}</small></span><span className="zone-category-count">{loading || error ? "—" : counts[item.id]}</span></button>)}
      </div>
      <div id="zone-category-panel" role="tabpanel" aria-labelledby={`zone-tab-${category}`} tabIndex={0}>
      <div className="table-tools">
        <div className="filter-input">
          <Search size={15} />
          <input ref={searchInput} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); clearQuery(); } }} placeholder={`搜尋${selected.label}`} aria-label={`搜尋${selected.label}`} />
        </div>
        {query && <button type="button" className="button" onClick={clearQuery}>清除搜尋</button>}
        <select className="zone-access-filter" aria-label="申請開放狀態" value={accessFilter} onChange={(event) => setAccessFilter(event.target.value)}><option value="all">全部申請狀態</option><option value="open">開放申請</option><option value="closed">暫停申請</option></select>
        <div className="tool-spacer" />
        <button type="button" className="button" disabled={loading || !!pending} onClick={refresh}><RefreshCw size={14} className={loading ? "spin" : ""} aria-hidden="true" />重新整理</button>
      </div>
      {notice && <p className="record-results" role="status">{notice}</p>}
      {failure && !closing && <p className="zone-access-error" role="alert">{failure}</p>}
      {!loading && !error && <p className="record-results" role="status">{selected.description} · 顯示 {rows.length} / {counts[category]} 個</p>}
      {error ? <ResourceError message={error} retry={refresh} /> : <ScrollRegion className="table-wrap" label="DNS 網域，可用方向鍵水平捲動">
        <table>
          <thead><tr><th scope="col">網域名稱</th><th scope="col">使用者申請</th><th scope="col">模式</th><th scope="col">序號</th><th scope="col">DNSSEC</th><th scope="col">紀錄數</th><th scope="col">權限</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
          <tbody>
            {loading ? <LoadingRows columns={8} /> : rows.map((zone) => {
              const path = zone.name.replace(/\.$/, "");
              return <tr key={zone.id}>
                <td><Link className="zone-link" href={`/zones/${encodeURIComponent(path)}`}><span className="zone-icon"><Globe2 size={15} /></span><strong>{path}</strong></Link></td>
                <td><button type="button" className="zone-access-switch" role="switch" aria-checked={accessFor(zone).enabled} aria-label={`${path} 開放申請`} disabled={!!pending} onClick={() => { setFailure(""); if (accessFor(zone).enabled) setClosing(zone); else void saveAccess(zone, true); }}><span className="zone-switch-track" aria-hidden="true"><span /></span><span>{pending === zone.id ? "儲存中…" : accessFor(zone).enabled ? "開放申請" : "暫停申請"}</span></button></td>
                <td>{zone.kind}</td>
                <td className="mono">{zone.serial}</td>
                <td><Badge tone={zone.dnssec ? "green" : "neutral"}>{zone.dnssec ? "已啟用" : "未啟用"}</Badge></td>
                <td>{zone.recordCount}</td>
                <td><Badge tone="blue">{({ SUPER_ADMIN: "系統管理員", ADMIN: "網域管理員", EDITOR: "編輯者", VIEWER: "唯讀" } as Record<string, string>)[zone.permission] || "—"}</Badge></td>
                <td><Link className="icon-button" href={`/zones/${encodeURIComponent(path)}`} aria-label={`開啟 ${zone.name}`}><ChevronRight size={16} /></Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </ScrollRegion>}
      {!loading && !error && rows.length === 0 && <EmptyState title={query || accessFilter !== "all" ? "此分類沒有符合條件的網域" : `目前沒有可管理的${selected.label}`} description="請調整搜尋、申請狀態，或切換其他分類。" action={(query || accessFilter !== "all") && <button type="button" className="button" onClick={() => { clearQuery(); setAccessFilter("all"); }}>清除此分類的篩選</button>} />}
      </div>
    </div>
    {closing && <Dialog title="暫停此網域的申請？" description={`${closing.name} 將從申請表移除，既有 DNS 與待審核申請不受影響。`} pending={!!pending} onClose={() => { setClosing(null); setFailure(""); }}>
      {failure && <p className="zone-access-error" role="alert">{failure}</p>}
      <div className="modal-foot"><button className="button" type="button" disabled={!!pending} onClick={() => { setClosing(null); setFailure(""); setConflict(false); }}>取消</button>{conflict ? <button type="button" className="button primary" onClick={refresh}>重新載入最新設定</button> : <button className="button primary" type="button" disabled={!!pending} onClick={() => void saveAccess(closing, false)}>{pending ? "儲存中…" : "暫停申請"}</button>}</div>
    </Dialog>}

  </>;
}
