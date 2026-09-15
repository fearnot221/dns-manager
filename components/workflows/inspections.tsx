"use client";
import { PersonName } from "@/components/ui/person-name";
import { useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { Dialog } from "@/components/ui/dialog";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Badge, EmptyState } from "@/components/ui";
import type { InventoryRecord } from "@/lib/inventory/types";

type Task = { id: string; userId: string; status: string; snapshot: { zoneName: string; recordName: string; recordType: string; content: string; purpose: string; applicantUnit: string }; response: string | null; createdAt: string; respondedAt: string | null; user: { email: null; name: string | null; studentId: string | null } };
const labels: Record<string, string> = { PENDING: "待確認", CONFIRMED: "確認仍在使用", ISSUE: "已回報問題", CANCELLED: "已撤回" };

function InspectionResponseForm({ pending, onSubmit }: { pending: boolean; onSubmit: (form: HTMLFormElement) => void }) {
  const [result, setResult] = useState("CONFIRMED");
  return <form className="form-surface message-reply" onSubmit={(event) => { event.preventDefault(); onSubmit(event.currentTarget); }}>
    <fieldset className="form-fields inspection-response" disabled={pending}>
      <label>確認結果<select name="status" value={result} onChange={(event) => setResult(event.target.value)}><option value="CONFIRMED">確認仍在使用</option><option value="ISSUE">回報問題</option></select></label>
      <label>{result === "ISSUE" ? "問題說明（必填）" : "補充說明（選填）"}<textarea name="response" required={result === "ISSUE"} maxLength={2000} rows={3} placeholder={result === "ISSUE" ? "請說明不再使用、資料有誤或其他需要協助的事項" : "如有需要，可補充使用情況"} /></label>
      <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "送出中…" : "送出確認"}</button></div>
    </fieldset>
  </form>;
}

export function InspectionsWorkbench({ admin, actorId }: { admin: boolean; actorId: string }) {
  const { data, loading, error, reload } = useResource<{ tasks: Task[] }>("/api/inspection-tasks");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [status, setStatus] = useState("PENDING");
  const saving = useRef(false);
  async function save(id: string, form?: HTMLFormElement) {
    if (saving.current) return;
    const values = form && new FormData(form);
    saving.current = true;
    setPending(true);
    setFeedback(null);
    try {
      await apiRequest("/api/inspection-tasks", jsonRequest(form ? "PATCH" : "DELETE", form
        ? { id, status: values!.get("status"), response: values!.get("response") } : { id }));
      setFeedback({ kind: "success", message: form ? "清查回覆已送出，可切換篩選條件查看。" : "清查通知已撤回。" });
      await reload();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "更新失敗" });
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const tasks = data?.tasks.filter((task) => status === "ALL" || task.status === status) || [];
  return <div className="workflow-page">
    <div className="admin-toolbar"><label>通知狀態<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">全部</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button" disabled={loading || pending} onClick={() => void reload()}>重新整理</button></div>
    <ActionFeedback feedback={feedback} />
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p className="workflow-loading" role="status">載入清查通知中…</p>
      : !tasks.length ? <div className="card"><EmptyState title="目前沒有符合條件的清查通知" description={status === "ALL" ? "新的清查通知會顯示在這裡。" : "可以切換為「全部」，查看其他狀態的通知。"} /></div>
      : <div className="workflow-list">{tasks.map((task) => <article className="card message-card inspection-card" key={task.id}>
        <div className="message-heading"><h3>{task.snapshot.recordName}</h3><Badge tone={task.status === "CONFIRMED" ? "green" : task.status === "ISSUE" ? "red" : task.status === "PENDING" ? "orange" : "neutral"}>{labels[task.status] || task.status}</Badge></div>
        <p className="workflow-meta"><PersonName name={task.user.name} studentId={task.user.studentId} /><time dateTime={task.createdAt}>{new Date(task.createdAt).toLocaleString("zh-TW")}</time></p>
        <dl className="inspection-details"><div><dt>類型</dt><dd><code>{task.snapshot.recordType}</code></dd></div><div><dt>內容</dt><dd><code>{task.snapshot.content}</code></dd></div><div><dt>單位</dt><dd>{task.snapshot.applicantUnit || "未填單位"}</dd></div><div><dt>用途</dt><dd>{task.snapshot.purpose || "未填用途"}</dd></div></dl>
        {task.response && <div className="message-reply"><strong>清查回覆</strong><p className="message-body">{task.response}</p></div>}
        {task.respondedAt && <p className="workflow-meta">處理時間：<time dateTime={task.respondedAt}>{new Date(task.respondedAt).toLocaleString("zh-TW")}</time></p>}
        {task.status === "PENDING" && task.userId === actorId && <InspectionResponseForm pending={pending} onSubmit={(form) => void save(task.id, form)} />}
        {admin && task.status === "PENDING" && <div className="form-actions"><button className="button danger" disabled={pending} onClick={() => { if (window.confirm("撤回此清查通知？使用者將無法繼續回覆。")) void save(task.id); }}>撤回通知</button></div>}
      </article>)}</div>}
  </div>;
}
export function AssignInspectionDialog({ record, onClose }: { record: InventoryRecord; onClose: () => void }) {
 const users = useResource<{ users: { id: string; name: string; studentId?: string | null; disabled: boolean }[] }>("/api/users");
 const [pending, setPending] = useState(false); const [error, setError] = useState("");
 return <Dialog title="指派使用者清查" description="所選使用者將能查看此筆 DNS 並回覆。這是站內通知，不會寄送郵件。" pending={pending} onClose={onClose}><form onSubmit={async (e) => { e.preventDefault(); if (pending) return; const values = new FormData(e.currentTarget); setPending(true); setError(""); try { await apiRequest("/api/inspection-tasks", jsonRequest("POST", { userId: values.get("userId"), record: { zoneName: record.zoneName, recordName: record.recordName, recordType: record.recordType, content: record.content } })); onClose(); } catch (e) { setError(e instanceof Error ? e.message : "指派失敗"); } finally { setPending(false); } }}><fieldset className="dialog-fields modal-body" disabled={pending || users.loading}><p>{record.recordName} · {record.recordType}</p><code style={{ overflowWrap: "anywhere" }}>{record.content}</code><label>負責確認的使用者<select name="userId" required defaultValue=""><option value="" disabled>選擇姓名／帳號</option>{users.data?.users.filter((user) => !user.disabled).map((user) => <option key={user.id} value={user.id}>{user.name} · {user.studentId || "未提供帳號"}</option>)}</select></label>{users.error && <ResourceError message={users.error} retry={users.reload} />}{error && <p role="alert">{error}</p>}<button className="button primary" disabled={!users.data || pending}>建立站內清查通知</button></fieldset></form></Dialog>;
}
