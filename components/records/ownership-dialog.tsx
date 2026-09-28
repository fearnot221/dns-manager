"use client";
import { PersonName } from "@/components/ui/person-name";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { SubmitButton } from "@/components/ui";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import type { InventoryRecord } from "@/lib/inventory/types";

export function OwnershipDialog({ record, inspection = false, onClose, onSaved }: { record: InventoryRecord; inspection?: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const sending = useRef(false);
  const [mode, setMode] = useState<"inspect" | "metadata">(inspection ? "inspect" : "metadata");
  const inspecting = mode === "inspect";
  const errorId = useId();
  const owner = record.ownership;
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return; sending.current = true; setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/inventory", jsonRequest("PUT", { id: owner.id, zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content, expectedUpdatedAt: owner.updatedAt, mode: inspecting ? "inspect" : "metadata", ...(inspecting ? { note: data.get("note") } : { applicantName: data.get("applicantName"), applicantEmail: data.get("applicantEmail"), applicantUnit: data.get("applicantUnit"), applicantExtension: data.get("applicantExtension"), purpose: data.get("purpose") }) }));
      toast.success(inspecting ? "已新增清查紀錄，日期與經手人由系統記錄。" : "已儲存歸屬資料，DNS 解析內容未變更。"); await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "儲存失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  return <Dialog title={inspection ? "DNS 清查" : "DNS 歸屬資料"} description="歸屬與清查資料獨立保存，不會改變 DNS 解析。" pending={pending} onClose={onClose}>
    {inspection && <div className="modal-body"><div className="view-switcher" role="group" aria-label="清查操作">{[{ key: "inspect" as const, label: "記錄清查" }, { key: "metadata" as const, label: "歸屬資料" }].map((item) => <button key={item.key} type="button" disabled={pending} aria-pressed={mode === item.key} className={mode === item.key ? "active" : ""} onClick={() => { setMode(item.key); setError(""); }}>{item.label}</button>)}</div></div>}
    <form onSubmit={submit}><fieldset disabled={pending} className="dialog-fields"><div className="modal-body">
    <div className="review-record"><strong>{record.recordName}</strong><span>{record.recordType} · {record.zoneName}</span><code>{record.content}</code></div>
    {inspecting ? <><p className="description">{owner.applicantName || "未填申請人"} · {owner.applicantUnit || "未填單位"} · {owner.purpose || "未填用途"}</p><div className="request-notice">清查時間以伺服器時間為準，經手人自動記錄目前登入帳號，不可代填。</div><label>清查備註<textarea name="note" aria-invalid={!!error} aria-describedby={error ? errorId : undefined} maxLength={2000} placeholder="例如：已與使用單位確認，服務持續使用中。" rows={3} /></label></> : <>
      <div className="field-grid four"><label>申請人姓名<input name="applicantName" defaultValue={owner.applicantName} maxLength={100} /></label><label>申請人電子郵件<input name="applicantEmail" type="email" defaultValue={owner.applicantEmail} /></label><label>申請單位<input name="applicantUnit" defaultValue={owner.applicantUnit} maxLength={200} /></label><label>單位分機<input name="applicantExtension" defaultValue={owner.applicantExtension} maxLength={30} /></label></div>
      <label>用途<textarea name="purpose" defaultValue={owner.purpose} maxLength={1000} rows={3} /></label>
      {owner.updatedAt && <p className="description">最近更新：{new Date(owner.updatedAt).toLocaleString("zh-TW")} · {owner.updatedByName || (owner.updatedBy.endsWith("@accounts.invalid") ? "未提供姓名" : owner.updatedBy)}</p>}
    </>}
    <InspectionHistory record={record} />
    {error && <div id={errorId} ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</div>}
  </div><div className="modal-foot"><button type="button" className="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} label={inspecting ? "確認清查並記錄" : "儲存歸屬資料"} /></div></fieldset></form></Dialog>;
}

function InspectionHistory({ record }: { record: InventoryRecord }) {
  return (<section className="inspection-history"><h3>歷次清查 <span>（{record.ownership.inspections.length}）</span></h3>{record.ownership.inspections.length ? <ol>{record.ownership.inspections.map((item) => <li key={item.id}><strong>{new Date(item.inspectedAt).toLocaleString("zh-TW")}</strong><PersonName name={item.inspectorName} email={item.inspectorEmail} studentId={item.inspectorStudentId} /><p>{item.note || "未填備註"}</p></li>)}</ol> : <p className="description">尚無清查紀錄。</p>}</section>);
}
