"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { PersonName } from "@/components/ui/person-name";
import type { RRSet } from "@/lib/dns/types";

type Change = { id: string; createdAt: string; zone: string; name: string | null; type: string | null; operation: string; userName: string | null; studentId: string | null; before: RRSet | null; after: RRSet | null; canRestore: boolean; reason: string; pending: boolean; snapshotAvailable?: boolean };
const labels: Record<string, string> = { CREATE: "新增", UPDATE: "修改", DELETE: "刪除" };
function Snapshot({ value }: { value: RRSet | null }) {
  return value ? <><p className="muted">TTL {value.ttl}s</p><ul>{value.records.map((record, index) => <li key={index}><code>{record.content}</code>{record.disabled && <span>（已停用）</span>}</li>)}</ul></> : <p className="muted">無紀錄組</p>;
}
export function DnsChangesWorkbench() {
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const sending = useRef(false);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const { data, loading, error, reload } = useResource<{ events: Change[]; total: number }>(`/api/dns-changes?page=${page}`);
  async function restore(id: string) {
    if (sending.current) return;
    sending.current = true; setPending(id); setFailure(null);
    try {
      await apiRequest(`/api/dns-changes/${encodeURIComponent(id)}/restore`, jsonRequest("POST", {}));
      toast.success("DNS 變更已復原");
      await reload();
    } catch (error) { setFailure({ id, message: error instanceof Error ? error.message : "復原未完成，請重新整理確認。" }); }
    finally { sending.current = false; setPending(null); }
  }
  return <>
    <div className="admin-toolbar"><p className="muted">依時間由新到舊排列，每頁 50 筆。</p><button className="button" disabled={loading || !!pending} onClick={() => void reload()}>重新整理</button></div>
    <p className="audit-help muted">「復原」會立即還原整個同名稱、同類型的 DNS 紀錄組（含 TTL）。若已有後續變更，系統會阻擋復原。此操作僅還原 DNS，單位歸屬、清查歷史與申請審核狀態不變。</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status">正在載入 DNS 變更紀錄…</p> : <div className="dns-change-list">{data?.events.map((entry) => <article className="card dns-change-entry" key={entry.id}>
      <div className="unit-heading"><div><h2>{labels[entry.operation] || "變更"} · {entry.name || entry.zone || "DNS 紀錄"}</h2><p><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("zh-TW")}</time> · {entry.type} · <PersonName name={entry.userName} studentId={entry.studentId} /></p></div><button className="button" disabled={!entry.canRestore || !!pending} aria-describedby={`restore-note-${entry.id}`} onClick={() => void restore(entry.id)}>{pending === entry.id ? "正在復原…" : entry.reason === "已復原" ? "已復原" : entry.pending ? "重試復原" : "復原"}</button></div>
      <p id={`restore-note-${entry.id}`} className="muted">{entry.reason || "復原前會比對目前 DNS，避免覆蓋後續變更。"}</p>
      {entry.snapshotAvailable !== false && <details><summary>查看變更前後</summary><div className="dns-change-snapshots"><section><h3>變更前</h3><Snapshot value={entry.before} /></section><section><h3>變更後</h3><Snapshot value={entry.after} /></section></div></details>}
      {failure?.id === entry.id && <p className="form-error" role="alert">{failure.message}</p>}
    </article>)}{!data?.events.length && <div className="empty">目前沒有 DNS 變更紀錄。</div>}</div>}
    <nav className="audit-pagination" aria-label="DNS 變更紀錄分頁"><button className="button" disabled={loading || !!pending || page === 1} onClick={() => { setFailure(null); setPage(page - 1); }}>上一頁</button><span role="status">第 {page} 頁 · 共 {data?.total ?? 0} 筆</span><button className="button" disabled={loading || !!pending || !!error || page >= 10000 || !data || page * 50 >= data.total} onClick={() => { setFailure(null); setPage(page + 1); }}>下一頁</button></nav>
  </>;
}
