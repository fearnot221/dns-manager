"use client";
import { useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { applicationTypes, type ApplicationPolicy } from "@/lib/requests/policy-model";
import { ResourceError } from "@/components/ui/resource-error";
export function ApplicationPolicySettings() {
  const resource = useResource<{ policy: ApplicationPolicy }>("/api/application-policy");
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">載入申請設定…</p>;
  const policy = resource.data.policy;
  return <form key={policy.updatedAt} className="card" onSubmit={async (event) => { event.preventDefault(); if (pending) return; const form = new FormData(event.currentTarget); setPending(true); setMessage(""); try { await apiRequest("/api/application-policy", jsonRequest("PUT", { policy: { allowedTypes: form.getAll("types"), ownership: form.get("ownership") }, expectedUpdatedAt: policy.updatedAt })); setMessage("設定已儲存，適用於接下來送出的申請；既有待審案件不會自動取消。"); await resource.reload(); } catch (e) { setMessage(e instanceof Error ? e.message : "儲存失敗"); } finally { setPending(false); } }}><fieldset className="dialog-fields modal-body" disabled={pending}><legend>DNS 申請規則</legend><p>沒有勾選任何類型時，暫停所有類型的新申請。</p><div className="page-actions">{applicationTypes.map((type) => <label key={type}><input type="checkbox" name="types" value={type} defaultChecked={policy.allowedTypes.includes(type)} /> {type}</label>)}</div><label>申請資格與歸屬<select name="ownership" defaultValue={policy.ownership}><option value="ANY">所有使用者，可申請個人或單位 DNS</option><option value="MEMBERS_ONLY">必須已加入單位，可申請個人或單位 DNS</option><option value="UNIT_ONLY">必須選擇單位歸屬，且具該單位申請權限</option></select></label><p className="muted">單位編輯者僅能提出變更申請；DNS 仍須由系統管理員審核後生效。</p><button className="button primary" disabled={pending}>{pending ? "儲存中…" : "儲存設定"}</button><p role="status">{message}</p></fieldset></form>;
}
