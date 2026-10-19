"use client";

import { useRef, useState } from "react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { applicationTypes, type ApplicationPolicy } from "@/lib/requests/policy-model";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { LoadingPanel } from "@/components/ui";

export function ApplicationPolicySettings() {
  return <div className="workflow-page"><GlobalApplicationPolicy /></div>;
}

function GlobalApplicationPolicy() {
  const resource = useResource<{ policy: ApplicationPolicy }>("/api/application-policy");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const saving = useRef(false);
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <LoadingPanel label="載入申請規則…" />;
  const policy = resource.data.policy;

  return <section className="card">
    <div className="workflow-feedback"><ActionFeedback feedback={feedback} /></div>
    <header className="workflow-panel-head"><div><h2>僅限系統管理員申請的類型</h2></div></header>
    <form key={policy.updatedAt} className="form-surface" onSubmit={async (event) => {
      event.preventDefault();
      if (saving.current) return;
      const form = new FormData(event.currentTarget);
      saving.current = true;
      setPending(true);
      setFeedback(null);
      try {
        await apiRequest("/api/application-policy", jsonRequest("PUT", { policy: { adminOnlyTypes: form.getAll("types"), ownership: form.get("ownership") }, expectedUpdatedAt: policy.updatedAt }));
        setFeedback({ kind: "success", message: "設定已儲存，套用於之後送出的申請。" });
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
          <legend className="sr-only">僅限系統管理員申請的類型</legend>
          <div className="policy-types">{applicationTypes.map((type) => <label className="type-option" key={type}><input type="checkbox" name="types" value={type} defaultChecked={policy.adminOnlyTypes.includes(type)} /><span>{type}</span></label>)}</div>
        </fieldset>
        <p className="field-help" id="policy-types-help">勾選的類型僅系統管理員可申請；未勾選的類型開放所有單位成員申請。所有網域皆開放申請，PTR 只列出反解網域，其他類型只列出正解網域。</p>
        <input type="hidden" name="ownership" value="UNIT_ONLY" />
        <div className="form-actions"><button className="button primary" aria-busy={pending}>{pending ? "儲存中…" : "儲存設定"}</button></div>
      </fieldset>
    </form>
  </section>;
}
