"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, SubmitButton } from "@/components/ui";
import { type DnsRequest } from "./model";

import { Dialog } from "@/components/ui/dialog";
import { apiRequest, jsonRequest } from "@/lib/client/api";

export function ReviewDialog({ review, onClose, onSaved }: { review: { item: DnsRequest; decision: "APPROVE" | "REJECT" }; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest(`/api/dns-requests/${encodeURIComponent(review.item.id)}`, jsonRequest("PATCH", { decision: review.decision, reviewNote: data.get("reviewNote") }));
      toast.success(review.decision === "APPROVE" ? "已核准，DNS 紀錄已建立" : "已標記為未核准");
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "無法完成審核，請稍後重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  const approving = review.decision === "APPROVE";
  return <Dialog title={approving ? "核准這筆 DNS 申請？" : "不核准這筆 DNS 申請？"} description={approving ? "核准後會立即建立 DNS 紀錄，請確認名稱與解析內容。" : "申請人會看到你的審核回覆。"} pending={pending} onClose={onClose}><form onSubmit={submit}><fieldset className="dialog-fields" disabled={pending}>
    <div className="modal-body"><div className="review-record"><Badge tone={review.item.recordType === "A" ? "orange" : "neutral"}>{review.item.recordType}</Badge><strong>{review.item.recordName}</strong><code>{review.item.content}</code><span>{review.item.zoneName} · {review.item.ttl}s TTL</span></div><label>審核回覆 <small>{approving ? "選填" : "建議填寫原因"}</small><textarea name="reviewNote" rows={3} maxLength={1000} placeholder="說明審核結果或需要補充的資料" /></label>{approving && <div className="warning"><AlertTriangle size={17} /><div><strong>即時變更 DNS</strong><p>同名稱、同類型的既有紀錄會保留。</p></div></div>}{error && <div ref={errorRef} tabIndex={-1} className="form-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{error}</div>}</div>
    <div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} label={approving ? "核准並建立紀錄" : "確認不核准"} /></div>
  </fieldset></form></Dialog>;
}
