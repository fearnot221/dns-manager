"use client";
import { useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Badge } from "@/components/ui";
import type { AuditEvent } from "@/lib/audit/service";

const labels: Record<string, string> = { MUTATION_STARTED: "開始操作", MUTATION_COMPLETED: "操作結束", CREATE_ZONE: "新增 Zone", DELETE_ZONE: "刪除 Zone", CREATE_RECORD: "新增 DNS", UPDATE_RECORD: "修改 DNS", DELETE_RECORD: "刪除 DNS", UPDATE_PERMISSION: "調整權限", CREATE_USER: "新增使用者", UPDATE_USER: "修改使用者", ADD_PORTAL_ALLOWLIST: "加入登入白名單", REMOVE_PORTAL_ALLOWLIST: "移除登入白名單", UPDATE_DNS_OWNERSHIP: "修改 DNS 歸屬", INSPECT_DNS_RECORD: "DNS 清查", REQUEST_DNS_APPLICATION: "送出 DNS 申請", APPROVE_DNS_REQUEST: "核准 DNS 申請", REJECT_DNS_REQUEST: "駁回 DNS 申請", SIGN_IN: "登入", SIGN_OUT: "登出" };
export function AuditWorkbench() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useResource<{ events: AuditEvent[]; total: number; page: number }>(`/api/audit?${new URLSearchParams({ q: search, status, action, page: String(page) })}`);
  return <>
    <form className="admin-toolbar audit-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
      <div className="filter-input"><input aria-label="搜尋操作紀錄" placeholder="帳號、網域、紀錄名稱或請求編號" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button className="button" type="submit">搜尋</button>
      <label>結果<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">全部</option><option value="success">成功／開始</option><option value="failed">失敗</option></select></label>
      <label>操作<select value={action} onChange={(event) => { setAction(event.target.value); setPage(1); }}><option value="">全部操作</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <button className="button" type="button" disabled={loading} onClick={() => void reload()}>重新整理</button>
    </form>
    <p className="muted">展開紀錄可查看變更前後內容。同一請求編號可串起開始、詳細變更與結果；只有開始而沒有結果的操作，需確認是否中斷。</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status">正在載入操作紀錄…</p> : <div className="card table-card"><ScrollRegion className="table-wrap" label="操作紀錄清單"><table><thead><tr><th>時間</th><th>操作者</th><th>操作／對象</th><th>結果</th><th>詳細資料</th></tr></thead><tbody>{data?.events.map((event) => <tr key={event.id}>
      <td className="audit-time">{new Date(event.createdAt).toLocaleString("zh-TW", { hour12: false })}</td><td>{event.userEmail}</td><td><strong>{labels[event.action] || event.action}</strong><div className="muted">{event.recordName || event.zone || "系統"}</div></td><td><Badge tone={event.action === "MUTATION_STARTED" ? "neutral" : event.success ? "green" : "red"}>{event.action === "MUTATION_STARTED" ? "開始" : event.success ? "成功" : "失敗"}</Badge></td>
      <td><details className="audit-detail"><summary>展開紀錄</summary><dl><dt>請求編號</dt><dd>{event.requestId}</dd><dt>IP</dt><dd>{event.ipAddress || "—"}</dd><dt>瀏覽器</dt><dd>{event.userAgent || "—"}</dd><dt>紀錄類型</dt><dd>{event.recordType || "—"}</dd></dl>{event.errorMessage && <p className="form-error">{event.errorMessage}</p>}<h4>變更前</h4><pre>{JSON.stringify(event.oldValue ?? null, null, 2)}</pre><h4>變更後／執行資訊</h4><pre>{JSON.stringify(event.newValue ?? null, null, 2)}</pre></details></td>
    </tr>)}</tbody></table></ScrollRegion>{!data?.events.length && <p className="empty">目前沒有符合條件的紀錄。</p>}</div>}
    <div className="admin-toolbar"><button className="button" disabled={loading || page === 1} onClick={() => setPage(page - 1)}>上一頁</button><span role="status">第 {page} 頁 · 共 {data?.total ?? 0} 筆</span><button className="button" disabled={loading || !data || page * 50 >= data.total} onClick={() => setPage(page + 1)}>下一頁</button></div>
  </>;
}
