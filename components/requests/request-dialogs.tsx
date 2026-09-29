"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, SubmitButton } from "@/components/ui";
import { type DnsRequest } from "./model";

import { Dialog } from "@/components/ui/dialog";
import { apiRequest, jsonRequest } from "@/lib/client/api";

export function ReviewDialog({ review, onClose, onSaved }: { review: { item: DnsRequest; decision: "APPROVE" | "REJECT" }; onClose: () => void; onSaved: () => Promise<void> }) {
  const errorId = useId();
  const deleting = review.item.operation === "DELETE";
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
      await apiRequest(`/api/dns-requests/${encodeURIComponent(review.item.id)}`, jsonRequest("PATCH", { decision: review.decision, reviewNote: data.get("reviewNote"), deletionPassword: data.get("deletionPassword") || undefined }));
      toast.success(review.decision === "APPROVE" ? deleting ? "已核准，指定的 DNS 解析值已刪除" : "已核准，DNS 紀錄已生效" : "已標記為未核准");
      await onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "無法完成審核，請稍後重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  const approving = review.decision === "APPROVE";
  return <Dialog title={approving ? deleting ? "核准刪除這筆 DNS？" : "核准這筆 DNS 申請？" : "不核准這筆 DNS 申請？"} description={approving ? deleting ? "核准後會立即刪除指定解析值，請確認刪除目標與申請原因。" : "核准後會立即套用 DNS，請確認申請類別與新舊解析內容。" : "申請人會看到你的審核回覆。"} pending={pending} onClose={onClose}><form onSubmit={submit}><fieldset className="dialog-fields" disabled={pending}>
    <div className="modal-body"><div className="review-record"><Badge tone={review.item.recordType === "A" ? "orange" : "neutral"}>{review.item.recordType}</Badge><strong>{review.item.recordName}</strong>{review.item.sourceRecordId && !deleting && <p>原內容：<code>{review.item.originalContent}</code></p>}<p>{deleting ? "刪除內容：" : review.item.sourceRecordId ? "新內容：" : "解析內容："}<code>{review.item.content}</code></p><span>{review.item.zoneName} · {review.item.ttl}s TTL</span></div><dl className="request-contact-details"><div><dt>申請人</dt><dd>{review.item.applicantName || "—"}</dd></div><div><dt>申請人電子郵件</dt><dd>{review.item.applicantEmail || "—"}</dd></div><div><dt>申請單位／分機</dt><dd>{review.item.applicantUnit || "—"}／{review.item.applicantExtension || "—"}</dd></div><div><dt>DNS 用途</dt><dd>{(review.item.sourceRecordId ? review.item.recordPurpose : review.item.purpose) || "—"}</dd></div></dl>{review.item.sourceRecordId && review.item.purpose && <p>申請原因：{review.item.purpose}</p>}{review.item.notes && <p>備註：{review.item.notes}</p>}<label>審核回覆 <small>{approving ? "選填" : "建議填寫原因"}</small><textarea name="reviewNote" rows={3} maxLength={1000} placeholder="說明審核結果或需要補充的資料" /></label>{approving && <div className="warning"><AlertTriangle size={17} /><div><strong>即時變更 DNS</strong><p>{deleting ? "只刪除申請指定的解析值。刪除最後一筆解析值時，會移除此名稱與類型的紀錄組。" : review.item.sourceRecordId ? "只替換申請指定的原解析值，其餘紀錄及 TTL 維持不變。" : "同名稱、同類型的既有紀錄會保留。"}</p></div></div>}{approving && (deleting || review.item.sourceRecordId) && <label>刪除保護密碼<input name="deletionPassword" type="password" autoComplete="off" maxLength={256} required aria-describedby={error ? errorId : undefined} /></label>}{error && <div id={errorId} ref={errorRef} tabIndex={-1} className="form-error" role="alert"><AlertTriangle size={15} aria-hidden="true" />{error}</div>}</div>
    <div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} tone={approving && !deleting ? "primary" : "danger"} label={approving ? deleting ? "核准並刪除" : "核准並套用紀錄" : "確認不核准"} /></div>
  </fieldset></form></Dialog>;
}
