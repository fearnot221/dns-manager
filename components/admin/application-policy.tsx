"use client";

import { useMemo, useRef, useState } from "react";
import { Globe2, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { ApiError, apiRequest, jsonRequest } from "@/lib/client/api";
import { applicationTypes, type ApplicationPolicy } from "@/lib/requests/policy-model";
import type { ZoneApplicationAccess } from "@/lib/requests/zone-access";
import { zoneCategories, zoneCategory } from "@/lib/dns/zone-category";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, LoadingRows } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";

type ZoneSetting = { id: string; name: string; applicationAccess: ZoneApplicationAccess };

export function ApplicationPolicySettings({ systemAdmin }: { systemAdmin: boolean }) {
  return <div className="workflow-page">
    {systemAdmin && <GlobalApplicationPolicy />}
    <ZoneApplicationSettings />
  </div>;
}

function GlobalApplicationPolicy() {
  const resource = useResource<{ policy: ApplicationPolicy }>("/api/application-policy");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const saving = useRef(false);
  if (resource.error) return <ResourceError message={resource.error} retry={resource.reload} />;
  if (!resource.data) return <p role="status">載入全域申請規則…</p>;
  const policy = resource.data.policy;

  return <section className="card">
    <ActionFeedback feedback={feedback} />
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
  </section>;
}

function ZoneApplicationSettings() {
  const resource = useResource<{ zones: ZoneSetting[] }>("/api/zones");
  const zones = resource.data?.zones ?? [];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [overrides, setOverrides] = useState<Record<string, ZoneApplicationAccess>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [closing, setClosing] = useState<ZoneSetting | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [conflict, setConflict] = useState(false);
  const saving = useRef(false);
  const accessFor = (zone: ZoneSetting) => overrides[zone.id] ?? zone.applicationAccess;
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return zones.filter((zone) => (!needle || zone.name.toLowerCase().includes(needle)) && (status === "all" || accessFor(zone).enabled === (status === "open")));
  // overrides represents the latest saved server response for each row.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, query, status, overrides]);

  function refresh() {
    if (saving.current) return;
    setOverrides({});
    setClosing(null);
    setConflict(false);
    setFeedback(null);
    void resource.reload();
  }

  async function save(zone: ZoneSetting, enabled: boolean) {
    if (saving.current) return;
    saving.current = true;
    setPending(zone.id);
    setFeedback(null);
    setConflict(false);
    try {
      const result = await apiRequest<{ access: ZoneApplicationAccess }>(`/api/zones/${encodeURIComponent(zone.name)}/applications`, jsonRequest("PATCH", { enabled, expectedUpdatedAt: accessFor(zone).updatedAt }));
      setOverrides((current) => ({ ...current, [zone.id]: result.access }));
      setFeedback({ kind: "success", message: `${zone.name.replace(/\.$/, "")} 已${enabled ? "開放" : "暫停"}申請。` });
      setClosing(null);
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "儲存失敗，請重試。" });
      setConflict(error instanceof ApiError && error.status === 409);
    } finally {
      saving.current = false;
      setPending(null);
    }
  }

  return <section className="card table-card">
    <ActionFeedback feedback={feedback} />
    <header className="workflow-panel-head"><Globe2 size={22} aria-hidden="true" /><div><h2>開放申請的網域</h2><p>選擇使用者可在申請表中選取的 Zone。暫停申請不會刪除 DNS，也不影響已送出的案件。</p></div></header>
    <div className="table-tools">
      <div className="filter-input"><Search size={15} aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋網域" aria-label="搜尋申請網域" /></div>
      <select className="zone-access-filter" aria-label="申請開放狀態" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部申請狀態</option><option value="open">開放申請</option><option value="closed">暫停申請</option></select>
      <div className="tool-spacer" />
      <button type="button" className="button" disabled={resource.loading || !!pending} onClick={refresh}><RefreshCw size={14} className={resource.loading ? "spin" : ""} aria-hidden="true" />重新整理</button>
    </div>
    {!resource.loading && !resource.error && <p className="record-results" role="status">顯示 {rows.length} / {zones.length} 個網域</p>}
    {resource.error ? <ResourceError message={resource.error} retry={refresh} /> : <ScrollRegion className="table-wrap" label="可申請網域設定，可水平捲動"><table><thead><tr><th scope="col">網域名稱</th><th scope="col">類別</th><th scope="col">使用者申請</th></tr></thead><tbody>
      {resource.loading ? <LoadingRows columns={3} /> : rows.map((zone) => {
        const access = accessFor(zone);
        const category = zoneCategories.find((item) => item.id === zoneCategory(zone.name));
        return <tr key={zone.id}><td><strong>{zone.name.replace(/\.$/, "")}</strong></td><td>{category?.label ?? "一般網域"}</td><td><button type="button" className="zone-access-switch" role="switch" aria-checked={access.enabled} aria-label={`${zone.name} 開放申請`} disabled={!!pending} onClick={() => access.enabled ? setClosing(zone) : void save(zone, true)}><span className="zone-switch-track" aria-hidden="true"><span /></span><span>{pending === zone.id ? "儲存中…" : access.enabled ? "開放申請" : "暫停申請"}</span></button></td></tr>;
      })}
    </tbody></table></ScrollRegion>}
    {!resource.loading && !resource.error && !rows.length && <EmptyState title={zones.length ? "沒有符合條件的網域" : "目前沒有可管理的網域"} description={zones.length ? "請調整搜尋或申請狀態。" : "取得可管理的 Zone 後，即可在此設定是否開放申請。"} />}
    {closing && <Dialog title="暫停此網域的申請？" description={`${closing.name} 將從申請表移除，既有 DNS 與待審核申請不受影響。`} pending={!!pending} onClose={() => { setClosing(null); setFeedback(null); setConflict(false); }}>
      <div className="modal-foot"><button className="button" type="button" disabled={!!pending} onClick={() => { setClosing(null); setFeedback(null); setConflict(false); }}>取消</button>{conflict ? <button type="button" className="button primary" onClick={refresh}>重新載入最新設定</button> : <button className="button primary" type="button" disabled={!!pending} onClick={() => void save(closing, false)}>{pending ? "儲存中…" : "暫停申請"}</button>}</div>
    </Dialog>}
  </section>;
}
