"use client";
import { PersonName } from "@/components/ui/person-name";
import { useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Badge } from "@/components/ui";
import { Select } from "@/components/ui/select";
import type { AuditEvent } from "@/lib/audit/service";

const labels: Record<string, string> = { EXPORT_ALL_DNS_CSV: "匯出全部 DNS CSV", CREATE_DNS_UNIT: "建立單位", JOIN_DNS_UNIT: "加入單位", ROTATE_UNIT_PASSCODE: "重設單位加入碼", MANAGE_UNIT_MEMBER: "調整單位成員", REQUEST_UNIT_DNS_CHANGE: "送出單位 DNS 變更", APPLY_UNIT_DNS_REQUEST: "套用單位 DNS 申請", REVIEW_UNIT_DNS_REQUEST: "審核單位 DNS 申請", REQUEST_DNS_RECORD: "送出單筆 DNS 申請", APPLY_APPROVED_DNS_RECORD: "寫入核准 DNS", CREATE_TEST_USER: "建立測試帳號", UPDATE_ZONE_APPLICATION_ACCESS: "調整網域申請開放", MUTATION_STARTED: "開始操作", MUTATION_COMPLETED: "操作結束", CREATE_ZONE: "新增 Zone", DELETE_ZONE: "刪除 Zone", CREATE_RECORD: "新增 DNS", UPDATE_RECORD: "修改 DNS", DELETE_RECORD: "刪除 DNS", UPDATE_PERMISSION: "調整權限", CREATE_USER: "新增使用者", UPDATE_USER: "修改使用者", ADD_PORTAL_ALLOWLIST: "加入登入白名單", REMOVE_PORTAL_ALLOWLIST: "移除登入白名單", UPDATE_DNS_OWNERSHIP: "修改 DNS 歸屬", INSPECT_DNS_RECORD: "DNS 清查", REQUEST_DNS_APPLICATION: "送出 DNS 申請", APPROVE_DNS_REQUEST: "核准 DNS 申請", REJECT_DNS_REQUEST: "駁回 DNS 申請", SIGN_IN: "登入", SIGN_OUT: "登出" };
export function AuditWorkbench() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const searchInput = useRef<HTMLInputElement>(null);
  const hasFilters = Boolean(query || search || action || status !== "all");
  const resetFilters = () => { setQuery(""); setSearch(""); setAction(""); setStatus("all"); setPage(1); searchInput.current?.focus(); };
  const traceRequest = (requestId: string) => { setQuery(requestId); setSearch(requestId); setAction(""); setStatus("all"); setPage(1); searchInput.current?.focus(); };
  const { data, loading, error, reload } = useResource<{ events: AuditEvent[]; total: number; page: number }>(`/api/audit?${new URLSearchParams({ q: search, status, action, page: String(page) })}`);
  return <>
    <form className="admin-toolbar audit-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
      <div className="filter-input"><input ref={searchInput} type="search" maxLength={200} aria-label="搜尋操作紀錄" placeholder="姓名、網域或請求編號" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <button className="button" type="submit">搜尋</button>
      <label>結果<Select aria-label="結果" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "all", label: "全部" }, { value: "success", label: "成功／開始" }, { value: "failed", label: "失敗" }]} /></label>
      <label>操作<Select aria-label="操作" value={action} onChange={(value) => { setAction(value); setPage(1); }} options={[{ value: "", label: "全部操作" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /></label>
      <button className="button" type="button" disabled={loading} onClick={() => void reload()}>重新整理</button>
      {hasFilters && <button className="button" type="button" onClick={resetFilters}>清除所有條件</button>}
    </form>
    <p className="audit-help muted">展開紀錄可查看變更前後內容，或點「追蹤此請求」查看同一操作的各階段。只有開始而沒有結果的操作，需確認是否中斷。</p>
    {query.trim() !== search && <p className="record-results" role="status">搜尋文字尚未套用，請按 Enter 或「搜尋」。</p>}
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status">正在載入操作紀錄…</p> : <div className="card table-card"><ScrollRegion className="table-wrap" label="操作紀錄清單"><table className="audit-table"><thead><tr><th scope="col">時間</th><th scope="col">操作者</th><th scope="col">操作／對象</th><th scope="col">結果</th><th scope="col">詳細資料</th></tr></thead><tbody>{data?.events.map((event) => <tr key={event.id}>
      <td className="audit-time">{new Date(event.createdAt).toLocaleString("zh-TW", { hour12: false })}</td><td><PersonName name={event.userName} studentId={event.userDisplayStudentId} /></td><td><strong>{labels[event.action] || event.action}</strong><div className="muted">{event.recordName || event.zone || "系統"}</div></td><td><Badge tone={event.action === "MUTATION_STARTED" ? "neutral" : event.success ? "green" : "red"}>{event.action === "MUTATION_STARTED" ? "開始" : event.success ? "成功" : "失敗"}</Badge></td>
      <td><details className="audit-detail"><summary aria-label={`展開 ${labels[event.action] || event.action} 的紀錄`}>展開紀錄</summary><dl><dt>請求編號</dt><dd><code>{event.requestId}</code>{event.requestId && <button type="button" className="button audit-trace" onClick={() => traceRequest(event.requestId)}>追蹤此請求</button>}</dd><dt>IP</dt><dd>{event.ipAddress || "—"}</dd><dt>瀏覽器</dt><dd>{event.userAgent || "—"}</dd><dt>紀錄類型</dt><dd>{event.recordType || "—"}</dd></dl>{event.errorMessage && <p className="form-error">{event.errorMessage}</p>}<h4>變更前</h4><ScrollRegion className="audit-json-scroll" label="變更前資料，可捲動"><pre>{JSON.stringify(event.oldValue ?? null, null, 2)}</pre></ScrollRegion><h4>變更後／執行資訊</h4><ScrollRegion className="audit-json-scroll" label="變更後資料，可捲動"><pre>{JSON.stringify(event.newValue ?? null, null, 2)}</pre></ScrollRegion></details></td>
    </tr>)}</tbody></table></ScrollRegion>{!data?.events.length && <div className="empty"><p>{hasFilters ? "目前沒有符合條件的紀錄。" : "目前尚無操作紀錄。"}</p>{hasFilters && <button type="button" className="button" onClick={resetFilters}>清除所有條件</button>}</div>}</div>}
    <nav className="audit-pagination" aria-label="操作紀錄分頁"><button type="button" className="button" disabled={loading || !!error || page === 1} onClick={() => setPage(page - 1)}>上一頁</button><span role="status">{loading ? "正在讀取…" : error ? "暫無分頁資訊" : `第 ${page} 頁 · 共 ${data?.total ?? 0} 筆`}</span><button type="button" className="button" disabled={loading || !!error || !data || page >= 10000 || page * 50 >= data.total} onClick={() => setPage(page + 1)}>下一頁</button></nav>
  </>;
}
