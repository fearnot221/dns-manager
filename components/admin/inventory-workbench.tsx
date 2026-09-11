"use client";
import { useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { EmptyState } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { OwnershipDialog } from "@/components/records/ownership-dialog";
import type { InventoryRecord } from "@/lib/inventory/types";
type Group = "applicantName" | "applicantUnit" | "purpose" | "zoneName";
export function InventoryWorkbench() {
  const { data, loading, error, reload } = useResource<{ records: InventoryRecord[] }>("/api/inventory");
  const [query, setQuery] = useState(""); const [group, setGroup] = useState<Group>("applicantUnit"); const [status, setStatus] = useState("all");
  const [dialog, setDialog] = useState<{ record: InventoryRecord; inspection: boolean } | null>(null);
  const groups = useMemo(() => {
    const map = new Map<string, InventoryRecord[]>();
    for (const record of data?.records || []) {
      const owner = record.ownership;
      if (status === "unreviewed" && owner.inspections.length) continue;
      if (status === "missing" && owner.applicantName && owner.applicantUnit && owner.purpose) continue;
      if (!`${record.zoneName} ${record.recordName} ${record.content} ${owner.applicantName} ${owner.applicantEmail} ${owner.applicantUnit} ${owner.purpose}`.toLowerCase().includes(query.trim().toLowerCase())) continue;
      const key = (group === "zoneName" ? record.zoneName : owner[group]) || "尚未填寫";
      map.set(key, [...(map.get(key) || []), record]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "zh-TW"));
  }, [data, group, query, status]);
  return <><div className="admin-toolbar card"><div className="filter-input"><Search size={16} /><input aria-label="搜尋 DNS 清查" placeholder="搜尋名稱、IP、申請人、單位或用途" value={query} onChange={(e) => setQuery(e.target.value)} /></div><label>分組<select value={group} onChange={(e) => setGroup(e.target.value as Group)}><option value="applicantUnit">依單位</option><option value="applicantName">依申請人</option><option value="purpose">依用途</option><option value="zoneName">依網域</option></select></label><label>顯示<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">全部紀錄</option><option value="unreviewed">尚未清查</option><option value="missing">歸屬資料未完整</option></select></label><button className="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} className={loading ? "spin" : ""} />重新整理</button></div>
    <p className="record-results" role="status">{loading ? "正在取得各網域的 DNS 紀錄…" : `共 ${groups.reduce((n, [, records]) => n + records.length, 0)} 筆解析值 · ${groups.length} 組`}</p>
    {error ? <ResourceError message={error} retry={reload} /> : !loading && !groups.length ? <EmptyState title="沒有符合條件的 DNS 紀錄" description="可清除搜尋或切換顯示條件。" action={<button className="button" onClick={() => { setQuery(""); setStatus("all"); }}>顯示全部</button>} /> : groups.map(([key, records]) => <section className="card inventory-group" key={key}><h2>{key}<span>{records.length} 筆</span></h2>{records.map((record) => <article className="inventory-row" key={record.ownership.id}><div><strong>{record.recordName}</strong><code>{record.recordType} · {record.content}</code><span>{record.ownership.applicantName || "未填申請人"} · {record.ownership.applicantUnit || "未填單位"}</span><p>{record.ownership.purpose || "未填用途"}</p></div><div className="inspection-last">{record.ownership.inspections[0] ? <><strong>{new Date(record.ownership.inspections[0].inspectedAt).toLocaleDateString("zh-TW")}</strong><span>{record.ownership.inspections[0].inspectorEmail}</span></> : <span>尚未清查</span>}{record.disabled && <span>DNS 已停用</span>}</div><div className="page-actions"><button className="button" onClick={() => setDialog({ record, inspection: false })}>歸屬／歷史</button><button className="button primary" onClick={() => setDialog({ record, inspection: true })}>記錄清查</button></div></article>)}</section>)}
    {dialog && <OwnershipDialog {...dialog} onClose={() => setDialog(null)} onSaved={async () => { setDialog(null); await reload(); }} />}
  </>;
}
