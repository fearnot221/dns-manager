"use client";

import { RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";

import { statuses, type DnsRequest, type RequestStatus } from "./model";
import { RequestCard } from "./request-card";
import { ReviewDialog } from "./request-dialogs";

import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";

const emptyRequests: DnsRequest[] = [];

export function DnsRequestsWorkbench({ admin }: { admin: boolean }) {
  const { data, loading, error, reload: load } = useResource<{ requests: DnsRequest[] }>("/api/dns-requests");
  const requests = data?.requests ?? emptyRequests;
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | RequestStatus>(admin ? "PENDING" : "ALL");
  const [review, setReview] = useState<{ item: DnsRequest; decision: "APPROVE" | "REJECT" } | null>(null);


  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((item) => {
      if (status !== "ALL" && item.status !== status) return false;
      return `${item.zoneName} ${item.recordName} ${item.recordType} ${item.content} ${item.user.email} ${item.applicantName ?? ""} ${item.applicantUnit ?? ""}`.toLowerCase().includes(needle);
    });
  }, [query, requests, status]);

  const counts = useMemo(() => Object.fromEntries(statuses.map(({ key }) => [
    key,
    key === "ALL" ? requests.length : requests.filter((item) => item.status === key).length,
  ])), [requests]);

  return <>
    <div className="request-toolbar">
      <div className="filter-input request-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={admin ? "搜尋名稱、內容或申請人" : "搜尋名稱、網域或內容"} aria-label="搜尋 DNS 申請" />{query && <button className="search-clear" onClick={() => setQuery("")} aria-label="清除搜尋"><X size={15} /></button>}</div>
      <button className="button request-refresh" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? "spin" : ""} />重新整理</button>
    </div>
      <div className="request-status-filter" role="group" aria-label="審核狀態">
        {statuses.map((item) => <button key={item.key} className={status === item.key ? "active" : ""} onClick={() => setStatus(item.key)} aria-pressed={status === item.key}>{item.label}<span>{loading ? "—" : counts[item.key] ?? 0}</span></button>)}
      </div>

    <div className="record-results request-results" aria-live="polite">{loading ? "讀取中…" : error ? "無法取得紀錄" : `共 ${filtered.length} 筆紀錄`}{!loading && filtered.length > 0 && <span>點選紀錄查看詳細資料</span>}</div>
    {error ? <ResourceError message={error} retry={load} /> : loading ? <RequestSkeleton /> : filtered.length === 0 ? <EmptyState title={requests.length ? "沒有符合條件的紀錄" : "尚無 DNS 申請"} description={requests.length ? "可以清除搜尋條件，或切換其他審核狀態。" : admin ? "收到申請後，可在這裡審核。" : "送出申請後，就能在這裡查看進度。"} action={requests.length ? <button className="button" onClick={() => { setQuery(""); setStatus("ALL"); }}>顯示全部紀錄</button> : !admin && <Link className="button primary" href="/requests/new">申請 DNS</Link>} /> : (
      <div className="request-list"><div className="request-row request-columns" aria-hidden="true"><span>類型</span><span>DNS 名稱</span><span>解析內容</span><span>狀態</span><span>申請日期</span><span /></div>{filtered.map((item) => <RequestCard key={item.id} item={item} admin={admin} onReview={(decision) => setReview({ item, decision })} />)}</div>
    )}

    {review && <ReviewDialog review={review} onClose={() => setReview(null)} onSaved={async () => { setReview(null); await load(); }} />}
  </>;
}

function RequestSkeleton() {
  return <div className="request-list">{[0, 1, 2].map((item) => <div className="card request-card request-skeleton" key={item}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>)}</div>;
}
