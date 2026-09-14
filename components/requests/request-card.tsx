"use client";
import { PersonName } from "@/components/ui/person-name";

import { ChevronDown } from "lucide-react";
import { type DnsRequest } from "./model";

const statusNames = { PENDING: "待審核", APPROVED: "已核准", REJECTED: "未核准", CANCELLED: "已取消" };
export function RequestCard({ item, admin, onReview }: { item: DnsRequest; admin: boolean; onReview: (decision: "APPROVE" | "REJECT") => void }) {
  const date = new Date(item.createdAt);
  return <details className="request-entry">
    <summary className="request-row">
      <span className="request-type">{item.recordType}</span>
      <span className="request-host"><span>{item.recordName.replace(/\.$/, "")}</span>{item.reviewNote && <small>有審核回覆</small>}</span>
      <code className="request-value">{item.content}</code>
      <span className={"request-status status-" + item.status.toLowerCase()}>{statusNames[item.status]}</span>
      <time className="request-date" dateTime={item.createdAt} title={date.toLocaleString("zh-TW")}>{new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit" }).format(date)}</time>
      <ChevronDown size={15} className="request-chevron" aria-hidden="true" />
    </summary>
    <div className="request-detail">
      <dl>
        <div><dt>申請類別</dt><dd>{item.sourceRecordId ? "變更既有 DNS" : "新增 DNS"}{item.unitId ? " · 單位共享" : ""}</dd></div>
        {item.sourceRecordId && <div><dt>原解析內容</dt><dd><code>{item.originalContent}</code></dd></div>}
        <div><dt>完整名稱</dt><dd><code>{item.recordName}</code></dd></div>
        <div><dt>內容</dt><dd><code>{item.content}</code></dd></div>
        <div><dt>TTL</dt><dd>{item.ttl} 秒</dd></div>
        <div><dt>申請時間</dt><dd>{date.toLocaleString("zh-TW")}</dd></div>
        {admin && <div><dt>申請使用者</dt><dd><PersonName name={item.user.name} email={item.user.email} /></dd></div>}
        {item.applicantName && <><div><dt>申請人</dt><dd>{item.applicantName}</dd></div><div><dt>申請單位</dt><dd>{item.applicantUnit}</dd></div><div><dt>單位分機</dt><dd>{item.applicantExtension}</dd></div></>}
        {item.purpose && <div><dt>用途</dt><dd>{item.purpose}</dd></div>}
        {item.reviewNote && <div className="review-note"><dt>審核回覆</dt><dd>{item.reviewNote}</dd></div>}
      </dl>
      {admin && item.canReview && <div className="request-review-actions"><button className="button" onClick={() => onReview("REJECT")}>不核准</button><button className="button primary" onClick={() => onReview("APPROVE")}>核准此筆</button></div>}
    </div>
  </details>;
}
