"use client";
import { useId, useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";

type Status = { configured: boolean; updatedAt: string | null };
export function DeletionProtectionSettings({ canConfigure }: { canConfigure: boolean }) {
  const resource = useResource<Status>("/api/admin/deletion-protection");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const saving = useRef(false);
  const helpId = useId();
  const feedbackId = useId();
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">載入刪除保護設定…</p>;
  return <section className="card">
    <header className="workflow-panel-head"><div><h2>DNS 刪除保護密碼</h2><p role="status">{resource.data.configured ? "已設定；每次刪除都必須輸入密碼。" : "尚未設定；所有 DNS 刪除操作暫停。"}</p></div></header>
    <div id={feedbackId}><ActionFeedback feedback={feedback} /></div>
    <p className="form-surface">適用於刪除 DNS 解析值、Zone 及核准刪除申請。編輯紀錄組時移除或替換既有解析值，也需要驗證。此密碼與登入密碼分開管理。</p>
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
        <p id={helpId}>請設定 12–256 個字元；密碼不會顯示或提供查詢。更換密碼後，請通知需要執行刪除的管理員。</p>
        <label>新刪除保護密碼<input name="password" type="password" required minLength={12} maxLength={256} autoComplete="new-password" aria-describedby={`${helpId} ${feedbackId}`} /></label>
        <label>再次輸入新密碼<input name="confirmation" type="password" required minLength={12} maxLength={256} autoComplete="new-password" aria-describedby={feedbackId} aria-invalid={feedback?.kind === "error" || undefined} /></label>
        <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "儲存中…" : "儲存刪除保護密碼"}</button><button type="button" className="button" onClick={() => void resource.reload()}>重新載入設定</button></div>
      </fieldset>
    </form> : <p className="form-surface">只有最高管理員可以設定或更換密碼；需要刪除時請向最高管理員取得密碼。</p>}
  </section>;
}
