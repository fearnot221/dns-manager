"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { ResourceError } from "@/components/ui/resource-error";
import { useResource } from "@/lib/client/use-resource";
import type { DnsHistoryEvent } from "@/lib/dns/history";
import type { RRSet } from "@/lib/dns/types";

function StateSnapshot({ label, rrset }: { label: string; rrset: RRSet | null }) {
  return <div><strong>{label}</strong>{rrset ? <><p>TTL {rrset.ttl}s</p>{rrset.records.map((record) => <p key={record.content}><code>{record.content}</code>{record.disabled && "（停用）"}</p>)}</> : <p>不存在</p>}</div>;
}
export function HistoryDialog({ zone, name = "", type = "", onClose }: { zone: string; name?: string; type?: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const params = new URLSearchParams({ zone, name, type, q: query, page: String(page) });
  const { data, loading, error, reload } = useResource<{ events: DnsHistoryEvent[]; total: number; page: number }>(`/api/dns-history?${params}`);
  return <Dialog title="DNS 歷程記錄" description={name ? `${name} · ${type}` : `${zone} · 包含已刪除的紀錄`} onClose={onClose}>
    <div className="modal-body dns-history"><label>搜尋名稱、類型或解析值<input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
    <p className="description">同一名稱與類型的新增、修改、刪除及重建會保留在同一歷程。既有 DNS 若沒有操作快照，無法回溯更早的變更。</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status">正在載入歷程…</p> : <>
      <p role="status">共 {data?.total ?? 0} 筆歷程</p>
      {!data?.events.length && <p>目前沒有符合條件的歷程記錄。</p>}
      {data?.events.map((event) => <article className="card inventory-group" key={event.id}>
        <h3>{event.recordName} · {event.recordType} · {{ CREATE: "建立", UPDATE: "修改", DELETE: "刪除" }[event.operation]}</h3>
        <p><time dateTime={event.createdAt}>{new Date(event.createdAt).toLocaleString("zh-TW")}</time> · {event.userName || event.userEmail}</p>
        {event.legacyScope && <p className="description">舊操作快照（未記錄 PowerDNS 連線來源）</p>}
        <StateSnapshot label="變更前" rrset={event.before} /><StateSnapshot label="變更後" rrset={event.after} />
      </article>)}
      <div className="page-actions"><button className="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button><span>第 {page} 頁</span><button className="button" disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage(page + 1)}>下一頁</button></div>
    </>}</div>
  </Dialog>;
}
