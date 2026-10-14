"use client";

import { useRef, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { ApiError, apiRequest, jsonRequest } from "@/lib/client/api";
import { eventFields, eventStatus, type InspectionEventView } from "@/lib/inspection-events/model";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Dialog } from "@/components/ui/dialog";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Badge, EmptyState, LoadingRows, SubmitButton } from "@/components/ui";

const endpoint = "/api/admin/inspection-events";
type Editor = { kind: "create" } | { kind: "edit" | "delete"; event: InspectionEventView };

export function InspectionEvents() {
  const resource = useResource<{ events: InspectionEventView[]; today: string }>(endpoint);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const saving = useRef(false);
  const selected = editor && editor.kind !== "create" ? editor.event : null;

  function open(next: Editor) { setFeedback(null); setConflict(false); setErrors({}); setEditor(next); }
  async function save(form?: FormData) {
    if (!editor || saving.current) return;
    const event = form ? { name: form.get("name"), startsOn: form.get("startsOn"), endsOn: form.get("endsOn") } : undefined;
    if (event) {
      const checked = eventFields.safeParse(event);
      if (!checked.success) { setErrors(Object.fromEntries(checked.error.issues.map((issue) => [String(issue.path[0]), issue.message]))); return; }
    }
    saving.current = true; setPending(true); setFeedback(null); setErrors({}); setConflict(false);
    try {
      await apiRequest(endpoint, jsonRequest(editor.kind === "create" ? "POST" : editor.kind === "edit" ? "PATCH" : "DELETE",
        editor.kind === "create" ? event : { id: editor.event.id, expectedRevision: editor.event.revision, ...(event ? { event } : {}) }));
      setEditor(null);
      setFeedback({ kind: "success", message: editor.kind === "delete" ? "清查活動已刪除。" : "清查活動已儲存。" });
      await resource.reload();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "操作失敗，請重試。" });
      setConflict(error instanceof ApiError && error.status === 409);
    } finally { saving.current = false; setPending(false); }
  }

  return <div className="card table-card">
    {!editor && <ActionFeedback feedback={feedback} />}
    <div className="table-tools">
      <button type="button" className="button primary" onClick={() => open({ kind: "create" })}><Plus size={16} aria-hidden="true" />新增清查活動</button>
      <div className="tool-spacer" />
      <button type="button" className="button" disabled={resource.loading || pending} onClick={() => void resource.reload()}><RefreshCw size={16} aria-hidden="true" />重新整理</button>
    </div>
    {resource.error ? <ResourceError message={resource.error} retry={resource.reload} /> : <ScrollRegion className="table-wrap" label="清查活動，可水平捲動"><table className="inspection-events-table"><thead><tr><th scope="col">活動名稱</th><th scope="col">開始日期</th><th scope="col">結束日期</th><th scope="col">狀態</th><th scope="col">操作</th></tr></thead><tbody>
      {resource.loading && !resource.data ? <LoadingRows columns={5} /> : resource.data?.events.map((event) => {
        const status = eventStatus(event, resource.data!.today);
        return <tr key={event.id}><td>{event.name}</td><td><time dateTime={event.startsOn}>{event.startsOn}</time></td><td><time dateTime={event.endsOn}>{event.endsOn}</time></td><td><Badge tone={status === "進行中" ? "green" : "neutral"}>{status}</Badge></td><td><div className="page-actions">
          <button type="button" className="icon-button" title="編輯" aria-label={`編輯 ${event.name}`} onClick={() => open({ kind: "edit", event })}><Pencil size={16} aria-hidden="true" /></button>
          <button type="button" className="icon-button danger" title="刪除" aria-label={`刪除 ${event.name}`} onClick={() => open({ kind: "delete", event })}><Trash2 size={16} aria-hidden="true" /></button>
        </div></td></tr>;
      })}
    </tbody></table></ScrollRegion>}
    {!resource.loading && !resource.error && !resource.data?.events.length && <EmptyState title="尚無清查活動" description="目前沒有排定的清查期間。" />}
    {editor && <Dialog title={editor.kind === "delete" ? "刪除清查活動？" : editor.kind === "create" ? "新增清查活動" : "編輯清查活動"} pending={pending} onClose={() => { setEditor(null); setFeedback(null); }}>
      <div className="modal-body"><ActionFeedback feedback={feedback} />
        {editor.kind === "delete" ? <><p className="unit-wrap">{selected!.name}</p><p>歷次清查紀錄會保留當時的活動標記。</p><div className="form-actions"><button type="button" className="button" disabled={pending} data-dialog-initial-focus onClick={() => { setEditor(null); setFeedback(null); }}>取消</button><button type="button" className="button danger" disabled={pending} onClick={() => void save()}>{pending ? "刪除中…" : "確認刪除"}</button></div></> :
          <form className="form-surface" onSubmit={(event) => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
            <fieldset className="form-fields" disabled={pending}>
              <label>活動名稱<input name="name" required maxLength={120} defaultValue={selected?.name ?? ""} aria-invalid={!!errors.name} aria-describedby={errors.name ? "event-name-error" : undefined} /></label>
              {errors.name && <p id="event-name-error" className="form-error" role="alert">{errors.name}</p>}
              <label>開始日期<input name="startsOn" type="date" required defaultValue={selected?.startsOn ?? ""} aria-invalid={!!errors.startsOn} aria-describedby={errors.startsOn ? "event-start-error" : undefined} /></label>
              {errors.startsOn && <p id="event-start-error" className="form-error" role="alert">{errors.startsOn}</p>}
              <label>結束日期<input name="endsOn" type="date" required defaultValue={selected?.endsOn ?? ""} aria-invalid={!!errors.endsOn} aria-describedby={`inspection-event-dates${errors.endsOn ? " event-end-error" : ""}`} /></label>
              {errors.endsOn && <p id="event-end-error" className="form-error" role="alert">{errors.endsOn}</p>}
              <p className="field-help" id="inspection-event-dates">台北時間，包含開始日與結束日。</p>
              <div className="form-actions"><SubmitButton pending={pending} label="儲存活動" /></div>
            </fieldset>
          </form>}
        {conflict && <button type="button" className="button" disabled={pending} onClick={() => { setEditor(null); setFeedback(null); void resource.reload(); }}>重新載入活動</button>}
      </div>
    </Dialog>}
  </div>;
}
