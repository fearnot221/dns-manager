"use client";
import { PersonName } from "@/components/ui/person-name";
import { Fragment, useRef, useState } from "react";
import { AlertCircle, ChevronRight, RefreshCw, Search } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Select } from "@/components/ui/select";
import { LoadingPanel } from "@/components/ui";
import type { AuditEvent } from "@/lib/audit/service";
const labels: Record<string, string> = { INSPECTION_EVENT_CREATE: "新增清查活動", INSPECTION_EVENT_UPDATE: "編輯清查活動", INSPECTION_EVENT_DELETE: "刪除清查活動", UPDATE_DELETION_PROTECTION: "設定刪除保護密碼", RESTORE_DNS_CHANGE: "復原 DNS 變更", INSPECT_UNIT_DNS: "單位 DNS 清查", REQUEST_UNIT_DNS_DELETE: "送出單位 DNS 刪除申請", DELETE_DNS_INSPECTION: "刪除清查紀錄", ASSIGN_DNS_UNIT: "指派 DNS 所屬單位", ADD_UNIT_ALLOWLIST: "新增單位使用者", REMOVE_UNIT_ALLOWLIST: "移除單位使用者", ENROLL_UNIT_ALLOWLIST: "使用者加入單位", EXPORT_ALL_DNS_CSV: "匯出全部 DNS CSV", RENAME_DNS_UNIT: "修改單位名稱", DELETE_DNS_UNIT: "刪除單位", CREATE_DNS_UNIT: "建立單位", ASSIGN_UNIT_MANAGER: "指定單位管理人", REVIEW_DNS_UNIT: "單位審核（舊制）", JOIN_DNS_UNIT: "加入單位", ROTATE_UNIT_PASSCODE: "重設單位加入碼", MANAGE_UNIT_MEMBER: "調整單位成員", REQUEST_UNIT_DNS_CHANGE: "送出單位 DNS 變更", APPLY_UNIT_DNS_REQUEST: "套用單位 DNS 申請", REVIEW_UNIT_DNS_REQUEST: "審核單位 DNS 申請", REQUEST_DNS_RECORD: "送出單筆 DNS 申請", APPLY_APPROVED_DNS_RECORD: "寫入核准 DNS", CREATE_TEST_USER: "建立測試帳號", UPDATE_ZONE_APPLICATION_ACCESS: "調整網域申請開放", MUTATION_STARTED: "開始操作", MUTATION_COMPLETED: "操作結束", CREATE_ZONE: "新增 Zone", DELETE_ZONE: "刪除 Zone", CREATE_RECORD: "新增 DNS", UPDATE_RECORD: "修改 DNS", DELETE_RECORD: "刪除 DNS", UPDATE_PERMISSION: "調整權限", CREATE_USER: "新增使用者", UPDATE_USER: "修改使用者", ADD_PORTAL_ALLOWLIST: "允許帳號登入（舊制）", REMOVE_PORTAL_ALLOWLIST: "撤銷帳號登入許可（舊制）", UPDATE_DNS_OWNERSHIP: "修改 DNS 歸屬", INSPECT_DNS_RECORD: "DNS 清查", REQUEST_DNS_APPLICATION: "送出 DNS 申請", APPROVE_DNS_REQUEST: "核准 DNS 申請", REJECT_DNS_REQUEST: "駁回 DNS 申請", SIGN_IN: "登入", SIGN_OUT: "登出", SYNC_RECORD: "同步 DNS 紀錄" };

const dateTime = new Intl.DateTimeFormat("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
function parts(value: string) {
  const values = Object.fromEntries(dateTime.formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}:${values.second}` };
}
function result(event: AuditEvent) {
  if (event.action === "MUTATION_STARTED") return { tone: "started", label: "開始" };
  return event.success ? { tone: "success", label: "成功" } : { tone: "failed", label: "失敗" };
}

export function AuditWorkbench() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const searchInput = useRef<HTMLInputElement>(null);
  const hasFilters = Boolean(query || search || action || status !== "all");
  const resetFilters = () => { setQuery(""); setSearch(""); setAction(""); setStatus("all"); setPage(1); searchInput.current?.focus(); };
  const traceRequest = (requestId: string) => { setQuery(requestId); setSearch(requestId); setAction(""); setStatus("all"); setPage(1); searchInput.current?.focus(); };
  const toggle = (id: string) => setExpanded((current) => { const next = new Set(current); if (!next.delete(id)) next.add(id); return next; });
  const { data, loading, error, reload } = useResource<{ events: AuditEvent[]; total: number; page: number }>(`/api/audit?${new URLSearchParams({ q: search, status, action, page: String(page) })}`, { keepPreviousData: true });
  return <>
    <form className="admin-toolbar audit-toolbar" onSubmit={(event) => { event.preventDefault(); setSearch(query.trim()); setPage(1); }}>
      <div className="filter-input"><Search size={15} aria-hidden="true" /><input ref={searchInput} type="search" maxLength={200} aria-label="搜尋操作紀錄" placeholder="姓名、網域或請求編號，按 Enter 搜尋" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <label>結果<Select aria-label="結果" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "all", label: "全部" }, { value: "success", label: "成功／開始" }, { value: "failed", label: "失敗" }]} /></label>
      <label>操作<Select aria-label="操作" value={action} onChange={(value) => { setAction(value); setPage(1); }} options={[{ value: "", label: "全部操作" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /></label>
      {hasFilters && <button className="button ghost" type="button" onClick={resetFilters}>清除條件</button>}
      <button className="button" type="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} className={loading ? "spin" : ""} aria-hidden="true" />重新整理</button>
    </form>
    <p className="record-results" role="status">{query.trim() !== search ? "搜尋文字尚未套用，請按 Enter。" : loading && !data ? "正在載入操作紀錄…" : error ? "無法取得操作紀錄" : `共 ${data?.total ?? 0} 筆 · 點選列可查看請求資訊與變更內容；只有「開始」而沒有結果的操作，可能已中斷。`}</p>
    {error ? <ResourceError message={error} retry={reload} /> : loading && !data ? <LoadingPanel label="正在載入操作紀錄…" /> : <div className={`card table-card${loading ? " is-refreshing" : ""}`} aria-busy={loading}><ScrollRegion className="table-wrap" label="操作紀錄清單"><table className="audit-table">
      <thead><tr><th scope="col"><span className="sr-only">展開</span></th><th scope="col">時間</th><th scope="col">操作者</th><th scope="col">操作</th><th scope="col">對象</th><th scope="col">結果</th></tr></thead>
      <tbody>{data?.events.map((event) => {
        const open = expanded.has(event.id);
        const label = labels[event.action];
        const when = parts(event.createdAt);
        const outcome = result(event);
        const detailId = `audit-detail-${event.id}`;
        return <Fragment key={event.id}>
          <tr className={`audit-row${open ? " is-open" : ""}`} onClick={(click) => { if (!(click.target as HTMLElement).closest("button, a")) toggle(event.id); }}>
            <td className="audit-toggle-cell"><button type="button" className="audit-toggle" aria-expanded={open} aria-controls={open ? detailId : undefined} aria-label={`${open ? "收合" : "展開"} ${when.date} ${when.time} ${label ?? event.action} 的明細`} onClick={() => toggle(event.id)}><ChevronRight size={16} aria-hidden="true" /></button></td>
            <td className="audit-time"><time dateTime={event.createdAt}><span>{when.date}</span> {when.time}</time></td>
            <td><PersonName name={event.userName} studentId={event.userDisplayStudentId} /></td>
            <td className="audit-action">{label ? <strong>{label}</strong> : <code>{event.action}</code>}</td>
            <td className="audit-target"><span>{event.recordName || event.zone || "系統"}</span>{event.recordType && <small>{event.recordType}</small>}</td>
            <td><span className={`audit-result is-${outcome.tone}`}>{outcome.label}</span></td>
          </tr>
          {open && <tr className="audit-detail-row" id={detailId}><td colSpan={6}><AuditDetail event={event} onTrace={traceRequest} /></td></tr>}
        </Fragment>;
      })}</tbody>
    </table></ScrollRegion>{!data?.events.length && <div className="empty"><p>{hasFilters ? "目前沒有符合條件的紀錄。" : "目前尚無操作紀錄。"}</p>{hasFilters && <button type="button" className="button" onClick={resetFilters}>清除所有條件</button>}</div>}</div>}
    <nav className="audit-pagination" aria-label="操作紀錄分頁"><button type="button" className="button" disabled={loading || !!error || page === 1} onClick={() => setPage(page - 1)}>上一頁</button><span role="status">{loading ? "正在讀取…" : error ? "暫無分頁資訊" : `第 ${page} 頁 · 共 ${data?.total ?? 0} 筆`}</span><button type="button" className="button" disabled={loading || !!error || !data || page >= 10000 || page * 50 >= data.total} onClick={() => setPage(page + 1)}>下一頁</button></nav>
  </>;
}

type Change = { key: string; before: unknown; after: unknown; changed: boolean };
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const empty = (value: unknown) => value === null || value === undefined || value === "";

/** Field-level comparison when both sides are objects (or one side is missing); otherwise null. */
export function auditChanges(before: unknown, after: unknown): Change[] | null {
  if (!(isRecord(before) || empty(before)) || !(isRecord(after) || empty(after))) return null;
  if (!isRecord(before) && !isRecord(after)) return [];
  const left = isRecord(before) ? before : {};
  const right = isRecord(after) ? after : {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].map((key) => ({ key, before: left[key], after: right[key], changed: JSON.stringify(left[key]) !== JSON.stringify(right[key]) }));
}

function AuditValue({ value }: { value: unknown }) {
  if (empty(value)) return <span className="audit-empty">—</span>;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return <span>{String(value)}</span>;
  if (Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.content === "string")) {
    return <ul className="audit-list">{value.map((item, index) => <li key={index}><code>{String((item as { content: string }).content)}</code>{(item as { disabled?: boolean }).disabled ? "（停用）" : ""}</li>)}</ul>;
  }
  if (Array.isArray(value) && value.every((item) => typeof item !== "object" || item === null)) return <span>{value.map(String).join("、")}</span>;
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}

function AuditDetail({ event, onTrace }: { event: AuditEvent; onTrace: (requestId: string) => void }) {
  const [showAll, setShowAll] = useState(false);
  const changes = auditChanges(event.oldValue, event.newValue);
  const changed = changes?.filter((change) => change.changed) ?? [];
  const unchanged = changes?.filter((change) => !change.changed) ?? [];
  const rows = showAll ? changes ?? [] : changed;
  const when = parts(event.createdAt);
  // A one-sided record (created or removed) lists its fields once instead of comparing against nothing.
  const side = empty(event.oldValue) && !empty(event.newValue) ? "after" : !empty(event.oldValue) && empty(event.newValue) ? "before" : null;
  const kind = side === "after" ? "新增內容" : side === "before" ? "移除內容" : "內容變更";
  return <div className="audit-detail">
    {event.errorMessage && <p className="form-error"><AlertCircle size={16} aria-hidden="true" /><span>{event.errorMessage}</span></p>}
    <div className="audit-detail-grid">
      <section className="audit-meta" aria-label="請求資訊">
        <h3>請求資訊</h3>
        <dl>
          <div><dt>請求編號</dt><dd><code>{event.requestId || "—"}</code>{event.requestId && <button type="button" className="link-button" onClick={() => onTrace(event.requestId)}>只看這個請求的紀錄</button>}</dd></div>
          <div><dt>時間</dt><dd className="mono">{when.date} {when.time}</dd></div>
          <div><dt>網域</dt><dd className="mono">{event.zone || "—"}</dd></div>
          {event.recordType && <div><dt>紀錄類型</dt><dd className="mono">{event.recordType}</dd></div>}
          <div><dt>IP</dt><dd className="mono">{event.ipAddress || "—"}</dd></div>
          <div><dt>瀏覽器</dt><dd className="audit-agent" title={event.userAgent ?? undefined}>{event.userAgent || "—"}</dd></div>
          {event.dnsScope && <div><dt>DNS 連線</dt><dd className="mono">{event.dnsScope}</dd></div>}
        </dl>
      </section>
      <section className="audit-changes" aria-label={kind}>
        <h3>{kind}{changes && changes.length > 0 && <small>{side ? `${changes.length} 個欄位` : `${changed.length} 個欄位不同${unchanged.length ? `，${unchanged.length} 個相同` : ""}`}</small>}</h3>
        {changes === null ? <div className="audit-compare">
          <figure><figcaption>變更前</figcaption><AuditValue value={event.oldValue} /></figure>
          <figure><figcaption>變更後／執行資訊</figcaption><AuditValue value={event.newValue} /></figure>
        </div> : changes.length === 0 ? <p className="muted">這個操作沒有記錄內容變更。</p> : side ? <table className="audit-diff is-single">
          <thead><tr><th scope="col">欄位</th><th scope="col">內容</th></tr></thead>
          <tbody>{changes.map((change) => <tr key={change.key}><th scope="row"><code>{change.key}</code></th><td><AuditValue value={change[side]} /></td></tr>)}</tbody>
        </table> : <>
          {rows.length > 0 ? <table className="audit-diff">
            <thead><tr><th scope="col">欄位</th><th scope="col">變更前</th><th scope="col">變更後</th></tr></thead>
            <tbody>{rows.map((change) => <tr key={change.key} className={change.changed ? "is-changed" : undefined}>
              <th scope="row"><code>{change.key}</code></th>
              <td className="is-before"><AuditValue value={change.before} /></td>
              <td className="is-after"><AuditValue value={change.after} /></td>
            </tr>)}</tbody>
          </table> : <p className="muted">內容沒有差異。</p>}
          {unchanged.length > 0 && <button type="button" className="link-button" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)}>{showAll ? "只顯示不同的欄位" : `顯示相同的 ${unchanged.length} 個欄位`}</button>}
        </>}
      </section>
    </div>
    <details className="audit-raw">
      <summary>原始 JSON</summary>
      <div className="audit-compare">
        <figure><figcaption>變更前</figcaption><ScrollRegion className="audit-json-scroll" label="變更前原始資料，可捲動"><pre>{JSON.stringify(event.oldValue ?? null, null, 2)}</pre></ScrollRegion></figure>
        <figure><figcaption>變更後／執行資訊</figcaption><ScrollRegion className="audit-json-scroll" label="變更後原始資料，可捲動"><pre>{JSON.stringify(event.newValue ?? null, null, 2)}</pre></ScrollRegion></figure>
      </div>
    </details>
  </div>;
}
