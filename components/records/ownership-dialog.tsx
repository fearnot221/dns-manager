"use client";
import { useResource } from "@/lib/client/use-resource";
import { Select } from "@/components/ui/select";
import { ResourceError } from "@/components/ui/resource-error";
import { PersonName } from "@/components/ui/person-name";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { zoneCategory } from "@/lib/dns/zone-category";
import type { InventoryRecord } from "@/lib/inventory/types";

export function OwnershipDialog({ record, inspection = false, systemAdmin = false, canDeleteInspections = false, onClose, onSaved }: { record: InventoryRecord; inspection?: boolean; systemAdmin?: boolean; canDeleteInspections?: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false); const [error, setError] = useState(""); const sending = useRef(false);
  const [assigning, setAssigning] = useState(false);
  const errorId = useId();
  const owner = record.ownership;
  const canAssignUnit = systemAdmin && zoneCategory(record.zoneName) === "forward";
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function removeInspection(id: string) {
    if (sending.current || !canDeleteInspections || !window.confirm("確定刪除此筆清查紀錄？")) return;
    sending.current = true; setPending(true); setError("");
    try {
      await apiRequest(`/api/inventory/inspections/${encodeURIComponent(id)}`, jsonRequest("DELETE", { recordId: owner.id, expectedUpdatedAt: owner.updatedAt }));
      toast.success("已刪除清查紀錄"); await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "刪除失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return; sending.current = true; setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    const inspecting = inspection && (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "inspect-and-metadata";
    try {
      await apiRequest("/api/inventory", jsonRequest("PUT", { id: owner.id, zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content, expectedUpdatedAt: owner.updatedAt, mode: inspecting ? "inspect-and-metadata" : "metadata", note: inspecting ? data.get("note") : "", applicantName: data.get("applicantName"), applicantEmail: data.get("applicantEmail"), applicantUnit: data.get("applicantUnit"), applicantExtension: data.get("applicantExtension"), purpose: data.get("purpose") }));
      toast.success(inspecting ? "已儲存歸屬資料並新增清查紀錄。" : "已儲存歸屬資料，DNS 解析內容未變更。"); await onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "儲存失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  if (assigning && inspection && canAssignUnit) return <UnitAssignmentDialog record={record} onClose={onClose} onBack={() => setAssigning(false)} onSaved={onSaved} />;
  return <Dialog title={inspection ? "DNS 清查" : "DNS 歸屬資料"} description="歸屬與清查資料獨立保存，不會改變 DNS 解析。" pending={pending} onClose={onClose}>
    <form onSubmit={submit} aria-describedby={error ? errorId : undefined}><fieldset disabled={pending} className="dialog-fields"><div className="modal-body">
      <div className="review-record"><strong>{record.recordName}</strong><span>{record.recordType} · {record.zoneName}</span><code>{record.content}</code></div>
      {inspection && <div><p className="description">所屬單位：{owner.unitId ? owner.unitName || owner.applicantUnit : "尚未指派"}</p>{canAssignUnit && <button type="button" className="button" onClick={() => { setAssigning(true); setError(""); }}>指派單位</button>}</div>}
      <h3>歸屬資料</h3>
      <div className="field-grid four"><label>申請人姓名<input name="applicantName" defaultValue={owner.applicantName} maxLength={100} /></label><label>申請人電子郵件<input name="applicantEmail" type="email" defaultValue={owner.applicantEmail} /></label><label>申請單位<input name="applicantUnit" defaultValue={owner.applicantUnit} maxLength={200} /></label><label>單位分機<input name="applicantExtension" defaultValue={owner.applicantExtension} maxLength={30} /></label></div>
      <label>用途<textarea name="purpose" defaultValue={owner.purpose} maxLength={1000} rows={3} /></label>
      {owner.updatedAt && <p className="description">最近更新：{new Date(owner.updatedAt).toLocaleString("zh-TW")} · {owner.updatedByName || (owner.updatedBy.endsWith("@accounts.invalid") ? "未提供姓名" : owner.updatedBy)}</p>}
      {inspection && <>
        <h3>記錄清查</h3>
        <div className="request-notice">清查時間以伺服器時間為準，經手人自動記錄目前登入帳號，不可代填。</div>
        <label>清查備註<textarea name="note" maxLength={2000} placeholder="例如：已與使用單位確認，服務持續使用中。" rows={3} /></label>
        <p className="description">「儲存並記錄清查」會一併儲存上方歸屬資料；只修改歸屬資料時，請選「儲存歸屬資料」。</p>
      </>}
      <InspectionHistory record={record} onDelete={canDeleteInspections ? removeInspection : undefined} />
      {error && <div id={errorId} ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</div>}
    </div><div className="modal-foot"><button type="button" className="button" onClick={onClose}>取消</button><button type="submit" name="action" value="metadata" className={inspection ? "button" : "button primary"}>{pending ? "處理中…" : "儲存歸屬資料"}</button>{inspection && <button type="submit" name="action" value="inspect-and-metadata" className="button primary">{pending ? "處理中…" : "儲存並記錄清查"}</button>}</div></fieldset></form></Dialog>;
}

function InspectionHistory({ record, onDelete }: { record: InventoryRecord; onDelete?: (id: string) => Promise<void> }) {
  return (<section className="inspection-history"><h3>歷次清查 <span>（{record.ownership.inspections.length}）</span></h3>{record.ownership.inspections.length ? <ol>{record.ownership.inspections.map((item) => <li key={item.id}><strong>{new Date(item.inspectedAt).toLocaleString("zh-TW")}</strong><PersonName name={item.inspectorName} email={item.inspectorEmail} studentId={item.inspectorStudentId} /><p>{item.note || "未填備註"}</p>{onDelete && <button type="button" className="button danger" aria-label={`刪除 ${new Date(item.inspectedAt).toLocaleString("zh-TW")} 的清查紀錄`} onClick={() => void onDelete(item.id)}>刪除</button>}</li>)}</ol> : <p className="description">尚無清查紀錄。</p>}</section>);
}

function UnitAssignmentDialog({ record, onClose, onBack, onSaved }: { record: InventoryRecord; onClose: () => void; onBack: () => void; onSaved: () => Promise<void> }) {
  const resource = useResource<{ units: { id: string; name: string; status: string }[] }>("/api/units");
  const units = (resource.data?.units ?? []).filter((unit) => unit.status === "APPROVED");
  const [unitId, setUnitId] = useState(record.ownership.unitId ?? "");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const helpId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  const selected = units.find((unit) => unit.id === unitId);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return <Dialog title="指派單位" description="設定這筆 DNS 的所屬單位，讓單位成員查看，並由具編輯權限的成員申請變更。不會修改 DNS 解析內容。" pending={pending} onClose={onClose}>
    <form onSubmit={async (event) => {
      event.preventDefault();
      if (sending.current || !selected || resource.loading || resource.error) return;
      sending.current = true; setPending(true); setError("");
      try {
        await apiRequest("/api/inventory/assignment", jsonRequest("PUT", { id: record.ownership.id, zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content, expectedUpdatedAt: record.ownership.updatedAt, unitId }));
        toast.success(`已指派給「${selected.name}」`);
        await onSaved();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "指派失敗，請重新嘗試。"); }
      finally { sending.current = false; setPending(false); }
    }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">
      <div className="review-record"><strong>{record.recordName}</strong><span>{record.recordType} · {record.zoneName}</span><code>{record.content}</code></div>
      <p className="description">目前所屬單位：{record.ownership.unitId ? record.ownership.unitName || record.ownership.applicantUnit : "尚未指派"}</p>
      {resource.loading ? <p role="status">正在載入可指派的單位…</p> : resource.error ? <ResourceError message={resource.error} retry={resource.reload} /> : units.length ? <label>指派給單位<Select aria-label="指派給單位" required value={unitId} onChange={setUnitId} aria-invalid={!!error} aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`} options={[{ value: "", label: "請選擇單位", disabled: true }, ...units.map((unit) => ({ value: unit.id, label: unit.name }))]} /></label> : <p role="status">目前沒有已啟用的單位，請先至「單位管理」建立單位。</p>}
      <p id={helpId} className="field-help">{record.ownership.unitId && unitId && record.ownership.unitId !== unitId ? "改派後，原單位將無法透過單位 DNS 存取此筆紀錄；原單位尚未核准的變更申請也無法再核准。" : unitId && unitId === record.ownership.unitId ? "此筆 DNS 已屬於選取的單位，無須再次指派。" : "只指派這一筆解析值，其他 DNS 紀錄不受影響。"}</p>
      {error && <p id={errorId} ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
    </div><div className="modal-foot"><button type="button" className="button" onClick={onBack}>返回清查</button><button type="submit" className="button primary" disabled={pending || resource.loading || !!resource.error || !selected || unitId === record.ownership.unitId}>{pending ? "指派中…" : "確認指派單位"}</button></div></fieldset></form>
  </Dialog>;
}
