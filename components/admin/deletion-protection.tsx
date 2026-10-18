"use client";
import { AlertTriangle } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { LoadingPanel } from "@/components/ui";

type Status = { configured: boolean; updatedAt: string | null };
export function DeletionProtectionSettings({ canConfigure }: { canConfigure: boolean }) {
  const resource = useResource<Status>("/api/admin/deletion-protection");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const saving = useRef(false);
  const helpId = useId();
  const feedbackId = useId();
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <LoadingPanel label="載入刪除保護設定…" />;
  return <section className="card">
    <header className="workflow-panel-head"><div><h2>DNS 刪除保護密碼</h2>{resource.data.configured && <p role="status">已設定</p>}</div></header>
    {!resource.data.configured && <div className="workflow-feedback"><div className="warning" role="status"><AlertTriangle size={18} aria-hidden="true" /><div><strong>尚未設定刪除保護密碼</strong><p>設定完成前，所有 DNS 刪除操作暫停。</p></div></div></div>}
    <div id={feedbackId} className="workflow-feedback"><ActionFeedback feedback={feedback} /></div>
    <p className="workflow-panel-note">刪除或替換解析值、刪除 Zone、核准刪除申請時需輸入；與登入密碼分開管理。</p>
    {canConfigure ? <form className="form-surface" onSubmit={async (event) => {
      event.preventDefault();
      if (saving.current) return;
      const form = event.currentTarget;
      const data = new FormData(form);
      if (data.get("password") !== data.get("confirmation")) { setFeedback({ kind: "error", message: "兩次密碼不一致，請重新輸入。" }); form.querySelector<HTMLInputElement>('[name="confirmation"]')?.focus(); return; }
      saving.current = true; setPending(true); setFeedback(null);
      try {
        await apiRequest("/api/admin/deletion-protection", jsonRequest("PUT", { password: data.get("password"), confirmation: data.get("confirmation"), expectedUpdatedAt: resource.data!.updatedAt }));
        form.reset();
        setFeedback({ kind: "success", message: "刪除保護密碼已更新，舊密碼立即失效。" });
        await resource.reload();
      } catch (error) { setFeedback({ kind: "error", message: error instanceof Error ? error.message : "儲存失敗" }); }
      finally { saving.current = false; setPending(false); }
    }}>
      <fieldset className="form-fields" disabled={pending}>
        <p id={helpId}>12–256 個字元，設定後無法查詢；更換後請通知相關管理員。</p>
        <label>新刪除保護密碼<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" aria-describedby={`${helpId} ${feedbackId}`} /></label>
        <label>再次輸入新密碼<input name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" aria-describedby={feedbackId} aria-invalid={feedback?.kind === "error" || undefined} /></label>
        <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "儲存中…" : "儲存刪除保護密碼"}</button><button type="button" className="button" onClick={() => void resource.reload()}>重新載入設定</button></div>
      </fieldset>
    </form> : <p className="workflow-panel-note">密碼由最高管理員設定，需要時請向其取得。</p>}
  </section>;
}
