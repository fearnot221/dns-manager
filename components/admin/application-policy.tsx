"use client";
import { useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { applicationTypes, type ApplicationPolicy } from "@/lib/requests/policy-model";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";

export function ApplicationPolicySettings() {
  const resource = useResource<{ policy: ApplicationPolicy }>("/api/application-policy");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const saving = useRef(false);
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">載入申請設定…</p>;
  const policy = resource.data.policy;

  return <div className="workflow-page">
    <ActionFeedback feedback={feedback} />
    <section className="card">
      <header className="workflow-panel-head"><SlidersHorizontal size={22} aria-hidden="true" /><div><h2>DNS 申請規則</h2><p>控制開放申請的紀錄類型，以及使用者需要符合的資格。</p></div></header>
      <form key={policy.updatedAt} className="form-surface" onSubmit={async (event) => {
        event.preventDefault();
        if (saving.current) return;
        const form = new FormData(event.currentTarget);
        saving.current = true;
        setPending(true);
        setFeedback(null);
        try {
          await apiRequest("/api/application-policy", jsonRequest("PUT", { policy: { allowedTypes: form.getAll("types"), ownership: form.get("ownership") }, expectedUpdatedAt: policy.updatedAt }));
          setFeedback({ kind: "success", message: "設定已儲存，適用於接下來送出的申請；既有待審案件不會自動取消。" });
          await resource.reload();
        } catch (error) {
          setFeedback({ kind: "error", message: error instanceof Error ? error.message : "儲存失敗" });
        } finally {
          saving.current = false;
          setPending(false);
        }
      }}>
        <fieldset className="form-fields" disabled={pending}>
          <fieldset className="policy-type-section" aria-describedby="policy-types-help">
            <legend>開放申請的類型</legend>
            <div className="policy-types">{applicationTypes.map((type) => <label className="type-option" key={type}><input type="checkbox" name="types" value={type} defaultChecked={policy.allowedTypes.includes(type)} /><span>{type}</span></label>)}</div>
          </fieldset>
          <p className="field-help" id="policy-types-help">未勾選任何類型時，將暫停所有類型的新申請。</p>
          <label>申請資格與歸屬<select name="ownership" defaultValue={policy.ownership} aria-describedby="policy-ownership-help">
            <option value="ANY">所有使用者，可申請個人或單位 DNS</option>
            <option value="MEMBERS_ONLY">必須已加入單位，可申請個人或單位 DNS</option>
            <option value="UNIT_ONLY">必須選擇單位歸屬，且具該單位申請權限</option>
          </select></label>
          <p className="field-help" id="policy-ownership-help">單位編輯者僅能提出變更申請；DNS 仍須由系統管理員審核後生效。</p>
          <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "儲存中…" : "儲存設定"}</button></div>
        </fieldset>
      </form>
    </section>
  </div>;
}
