"use client";

import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RecordType } from "@/lib/dns/types";
import { contentHelp } from "./model";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { useResource } from "@/lib/client/use-resource";
import { Dialog } from "@/components/ui/dialog";
import { canSubmitUnitRequest, type UnitRole } from "@/lib/units/policy";
import { Select } from "@/components/ui/select";

import { policyViolation, type ApplicationPolicy } from "@/lib/requests/policy-model";
type DraftRecord = { id: number; zoneName: string; name: string; type: RecordType; content: string; ttl: string; purpose: string };
const blankRecord = (id: number, zoneName = ""): DraftRecord => ({ id, zoneName, name: "", type: "A", content: "", ttl: "300", purpose: "" });
const hints: Partial<Record<RecordType, string>> = { A: "192.0.2.10", AAAA: "2001:db8::1", CNAME: "target.example.com", MX: "10 mail.example.com", TXT: "v=spf1 include:_spf.example.com ~all", SRV: "10 5 443 service.example.com", CAA: "0 issue letsencrypt.org" };

export function DnsApplicationForm() {
  const router = useRouter();
  const { data, loading, error: zoneError, reload } = useResource<{ zones: { name: string }[] }>("/api/dns-requests/zones");
  const zones = data?.zones ?? [];
  const policyResource = useResource<{ policy: ApplicationPolicy }>("/api/application-policy");
  const requestTypes = policyResource.data?.policy.allowedTypes || [];
  const unitResource = useResource<{ units: { id: string; name: string; role: UnitRole }[] }>("/api/units");
  const [unitId, setUnitId] = useState("");
  const selectedUnit = unitResource.data?.units.find((unit) => unit.id === unitId);
  const [records, setRecords] = useState<DraftRecord[]>([blankRecord(0)]);
  const nextId = useRef(1);
  const focusId = useRef<number | null>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const dirty = useRef(false);
  const [leaveTarget, setLeaveTarget] = useState<HTMLElement | null>(null);
  const [removed, setRemoved] = useState<{ record: DraftRecord; index: number } | null>(null);
  const [errorRecordId, setErrorRecordId] = useState<number | null>(null);
  const errorTarget = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorTarget.current?.focus(); }, [error]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) { event.preventDefault(); event.returnValue = ""; }
    };
    const confirmNavigation = (event: MouseEvent) => {
      if (!dirty.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("a[href], button[data-leave-workspace]") : null;
      if (!target) return;
      if (target instanceof HTMLAnchorElement) {
        if (target.target === "_blank" || target.hasAttribute("download")) return;
        const url = new URL(target.href);
        if (url.pathname === location.pathname && url.search === location.search) return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!sending.current) setLeaveTarget(target);
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, []);

  function update(id: number, values: Partial<DraftRecord>) {
    dirty.current = true;
    setRecords((previous) => previous.map((record) => record.id === id ? { ...record, ...values } : record));
    if (errorRecordId === id) { setError(""); setErrorRecordId(null); }
  }
  function addRecord() {
    dirty.current = true;
    const id = nextId.current++;
    focusId.current = id;
    setRecords((previous) => {
      const last = previous.at(-1);
      return [...previous, { ...blankRecord(id, last?.zoneName), type: last?.type ?? "A", ttl: last?.ttl ?? "300" }];
    });
  }
  function removeRecord(id: number) {
    const index = records.findIndex((record) => record.id === id);
    if (index < 0 || records.length < 2) return;
    dirty.current = true;
    setRemoved({ record: records[index], index });
    setRecords((previous) => previous.filter((record) => record.id !== id));
    setError(""); setErrorRecordId(null);
    addButton.current?.focus();
  }

  function undoRemove() {
    if (!removed) return;
    focusId.current = removed.record.id;
    setRecords((previous) => [...previous.slice(0, removed.index), removed.record, ...previous.slice(removed.index)]);
    setRemoved(null);
    setError(""); setErrorRecordId(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current || loading || zoneError || !zones.length) return;
    setError("");
    setErrorRecordId(null);
    if (!policyResource.data) { setError("無法取得申請規則，請重新載入。"); return; }
    const violation = policyViolation(policyResource.data.policy, records.map((r) => r.type), unitId || undefined, !!unitResource.data?.units.length);
    if (violation) { setError(violation); return; }
    const unavailable = records.findIndex((record) => !zones.some((zone) => zone.name === record.zoneName));
    if (unavailable !== -1) { setErrorRecordId(records[unavailable].id); setError("第 " + (unavailable + 1) + " 筆：請選擇目前可申請的 Zone 網域。"); return; }
    const formData = new FormData(event.currentTarget);
    sending.current = true;
    setPending(true);
    try {
      const result = await apiRequest<{ applicationId: string; count: number }>("/api/dns-requests", jsonRequest("POST", {
        applicantName: formData.get("applicantName"),
        applicantUnit: selectedUnit?.name || formData.get("applicantUnit"),
        ...(unitId ? { unitId } : {}),
        applicantExtension: formData.get("applicantExtension"),
        records: records.map((record) => ({ zoneName: record.zoneName, name: record.name, type: record.type, content: record.content, purpose: record.purpose, ttl: Number(record.ttl) })),
      }));
      toast.success("已送出 " + result.count + " 筆 DNS 申請，等待管理員審核");
      dirty.current = false;
      router.push("/requests");
      router.refresh();
    } catch (caught) {
      const message = (caught instanceof Error ? caught.message : "無法送出申請，請稍後重試。").replace("Invalid IPv4 address", "請填入有效的 IPv4 位址").replace("Invalid IPv6 address", "請填入有效的 IPv6 位址");
      const match = message.match(/^第 (\d+) 筆/);
      setErrorRecordId(match ? records[Number(match[1]) - 1]?.id ?? null : null);
      setError(message);
      sending.current = false;
      setPending(false);
    }
  }

  return <><p className="record-results" role="status">{policyResource.error || (policyResource.loading ? "載入申請規則…" : policyResource.data?.policy.ownership === "UNIT_ONLY" ? "目前僅接受單位共享 DNS，請先加入單位並選擇歸屬。" : policyResource.data?.policy.ownership === "MEMBERS_ONLY" ? "目前僅限已加入單位的使用者提出申請。" : "可申請個人或單位 DNS。")}</p><form className="card dns-application" onSubmit={submit} onChange={() => { dirty.current = true; }} aria-label="申請 DNS" aria-busy={pending}>
    <div className="modal-body">
      <fieldset className="application-section" disabled={pending}>
        <legend>申請人資料</legend>
        <label>DNS 歸屬<Select aria-label="DNS 歸屬" value={unitId} onChange={setUnitId} disabled={unitResource.loading || Boolean(unitResource.error)} options={[{ value: "", label: "個人（不與單位共享）" }, ...(unitResource.data?.units.filter((unit) => canSubmitUnitRequest(unit.role)).map((unit) => ({ value: unit.id, label: `${unit.name}（單位共享）` })) ?? [])]} /></label>
        <p className="application-help">選擇單位後，核准的 DNS 與申請進度會供單位成員查看；查看角色不能代單位申請。</p>
        {unitResource.error && <p className="request-notice" role="status">無法載入共享單位，目前僅可申請個人 DNS。<button className="button" type="button" onClick={() => void unitResource.reload()}>重新載入單位</button></p>}
        <div className="applicant-grid">
          <label>申請人姓名<input name="applicantName" autoComplete="name" required maxLength={100} placeholder="請填寫姓名" /></label>
          <label>申請單位{unitId ? <input value={selectedUnit?.name || "請重新載入單位"} readOnly /> : <input name="applicantUnit" autoComplete="organization" required maxLength={200} placeholder="系所、實驗室或行政單位" />}</label>
          <label>單位分機<input name="applicantExtension" inputMode="numeric" autoComplete="tel-extension" required pattern="[0-9]{1,10}" maxLength={10} title="請填入 1–10 位數字" placeholder="例如 1234" /></label>
        </div>
        <p className="application-help">聯絡資料為必填，同一份申請只需填一次。</p>
      </fieldset>

      <section className="application-records" aria-labelledby="application-records-title">
        <div className="application-records-heading"><h2 id="application-records-title">DNS 紀錄<span>{records.length} 筆</span></h2><button className="button" type="button" disabled={loading || pending} onClick={() => void reload()}><RefreshCw size={14} className={loading ? "spin" : ""} />重新載入網域</button></div>

        {loading && <p className="application-help" role="status">正在取得可申請的網域…</p>}
        {zoneError && <div className="form-error" role="alert"><AlertTriangle size={17} /><div>無法取得網域清單，請按「重新載入網域」重試。<small className="zone-error-detail">{zoneError}</small></div></div>}
        {!loading && !zoneError && zones.length === 0 && <div className="request-notice" role="status">目前沒有開放申請的網域，請聯絡管理員開放所需網域。</div>}

        {records.map((record, index) => <fieldset key={record.id} className={"application-record" + (errorRecordId === record.id ? " has-error" : "")} disabled={pending} aria-label={"第 " + (index + 1) + " 筆 DNS 紀錄"}>
          <div className="application-record-head"><h3>紀錄 {index + 1}</h3><button className="icon-button danger-hover" type="button" disabled={records.length === 1 || pending} aria-label={"移除第 " + (index + 1) + " 筆"} title="移除此筆，可復原" onClick={() => removeRecord(record.id)}><Trash2 size={16} /></button></div>
          <div className="dns-fields">
            <label>Zone 網域<Select aria-label="Zone 網域" value={record.zoneName} required disabled={loading || Boolean(zoneError) || !zones.length} onChange={(value) => update(record.id, { zoneName: value })} options={[{ value: "", label: "選擇網域", disabled: true }, ...(record.zoneName && !zones.some((zone) => zone.name === record.zoneName) ? [{ value: record.zoneName, label: `${record.zoneName}（目前無法使用）`, disabled: true }] : []), ...zones.map((zone) => ({ value: zone.name, label: zone.name.replace(/\.$/, "") }))]} /></label>
            <label>名稱<input value={record.name} onChange={(event) => update(record.id, { name: event.target.value })} placeholder="www 或 @" required maxLength={253} autoCapitalize="none" spellCheck={false} ref={(node) => { if (node && focusId.current === record.id) { if (!record.zoneName) node.closest("fieldset")?.querySelector<HTMLElement>(".custom-select-trigger")?.focus(); else node.focus(); focusId.current = null; } }} /></label>
            <label>類型<Select aria-label="DNS 類型" value={record.type} onChange={(value) => update(record.id, { type: value as RecordType })} options={[...(!requestTypes.includes(record.type as typeof requestTypes[number]) ? [{ value: record.type, label: `${record.type}（未開放，請改選）`, disabled: true }] : []), ...requestTypes.map((type) => ({ value: type, label: type }))]} /></label>
            <label className="content-field">解析內容<input value={record.content} onChange={(event) => update(record.id, { content: event.target.value })} placeholder={hints[record.type]} required maxLength={65535} autoCapitalize="none" spellCheck={false} aria-label="解析內容" aria-describedby={`content-help-${record.id}`} /><small id={`content-help-${record.id}`}>{contentHelp(record.type)}</small></label>
            <label>TTL<Select aria-label="TTL" value={record.ttl} onChange={(value) => update(record.id, { ttl: value })} options={[{ value: "60", label: "1 分鐘" }, { value: "300", label: "5 分鐘" }, { value: "600", label: "10 分鐘" }, { value: "1800", label: "30 分鐘" }, { value: "3600", label: "1 小時" }]} /></label>
            <label className="purpose-field">用途（選填）<input value={record.purpose} onChange={(event) => update(record.id, { purpose: event.target.value })} placeholder="服務名稱或申請原因" maxLength={1000} /></label>
          </div>
          {errorRecordId === record.id && <p className="record-error" role="alert" tabIndex={-1} ref={errorTarget}>{error}。其餘資料已保留。</p>}
        </fieldset>)}
        <button ref={addButton} className="button add-record-button" type="button" onClick={addRecord} disabled={pending}><Plus size={18} />新增下一筆 DNS 紀錄</button>
        {removed && <div className="removal-notice" role="status"><span>已移除 {removed.record.name || "未命名紀錄"}</span><button type="button" disabled={pending} onClick={undoRemove}>復原</button></div>}
      </section>
      <p className="application-review-note">送出後由管理員逐筆審核，核准前不會建立 DNS 紀錄。</p>
      {error && errorRecordId === null && <div className="form-error" role="alert"><AlertTriangle size={17} /><p ref={errorTarget} tabIndex={-1}>{error}。填寫內容已保留。</p></div>}
    </div>
    <div className="modal-foot"><span className="application-count" aria-live="polite">共 {records.length} 筆待送出</span><button className="button" type="button" data-leave-workspace disabled={pending} onClick={() => router.push("/requests")}>返回我的 DNS</button><button type="submit" className="button primary" disabled={pending || loading || Boolean(zoneError) || !zones.length || Boolean(unitId && (!selectedUnit || unitResource.loading || unitResource.error))}>{pending && <Loader2 className="spin" size={16} />}{pending ? "送出中…" : "送出 " + records.length + " 筆申請"}</button></div>
  </form>{leaveTarget && <Dialog title="要離開尚未送出的申請嗎？" description="離開後，這次填寫的聯絡資料和 DNS 紀錄不會保留。" onClose={() => setLeaveTarget(null)}><div className="modal-foot"><button type="button" className="button" onClick={() => { dirty.current = false; setLeaveTarget(null); leaveTarget.click(); }}>離開並捨棄</button><button type="button" className="button primary" data-dialog-initial-focus onClick={() => setLeaveTarget(null)}>繼續填寫</button></div></Dialog>}</>;
}
