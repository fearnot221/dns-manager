"use client";
import { ContactPicker } from "@/components/units/contact-picker";

import Link from "next/link";
import { useUnitWorkspace } from "@/components/units/unit-workspace";
import { EmptyState, LoadingPanel } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { AlertTriangle, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { RecordType } from "@/lib/dns/types";
import { contentHelp } from "./model";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { useResource } from "@/lib/client/use-resource";
import { Dialog } from "@/components/ui/dialog";
import { type UnitRole } from "@/lib/units/policy";
import { Select } from "@/components/ui/select";

import { availableTypes, policyViolation, zoneAcceptsType, type ApplicationPolicy } from "@/lib/requests/policy-model";
type DraftRecord = { id: number; zoneName: string; name: string; type: RecordType; content: string; ttl: string; purpose: string; notes: string };
const blankRecord = (id: number, zoneName = ""): DraftRecord => ({ id, zoneName, name: "", type: "A", content: "", ttl: "300", purpose: "", notes: "" });
const hints: Partial<Record<RecordType, string>> = { A: "192.0.2.10", AAAA: "2001:db8::1", CNAME: "target.example.com", TXT: "v=spf1 include:_spf.example.com ~all", PTR: "host.example.com" };
type ContentPart = { label: string; placeholder: string; numeric?: boolean; options?: string[] };
// Multi-value types get one input per value; the content string stays the single source of truth.
const contentParts: Partial<Record<RecordType, ContentPart[]>> = {
  MX: [{ label: "優先序", placeholder: "10", numeric: true }, { label: "郵件伺服器", placeholder: "mail.example.com" }],
  SRV: [{ label: "優先序", placeholder: "10", numeric: true }, { label: "權重", placeholder: "5", numeric: true }, { label: "連接埠", placeholder: "443", numeric: true }, { label: "目標主機", placeholder: "service.example.com" }],
  CAA: [{ label: "旗標", placeholder: "0", numeric: true }, { label: "標籤", placeholder: "issue", options: ["issue", "issuewild", "iodef"] }, { label: "值", placeholder: "letsencrypt.org" }],
};

export function DnsApplicationForm({ operation = "CREATE" }: { operation?: "CREATE" | "CLAIM" }) {
  const claiming = operation === "CLAIM";
  const router = useRouter();
  const workspace = useUnitWorkspace();
  const { data, loading, error: zoneError, reload } = useResource<{ zones: { name: string }[] }>("/api/dns-requests/zones");
  const zones = data?.zones ?? [];
  const zonesFor = (type: RecordType) => zones.filter((zone) => zoneAcceptsType(zone.name, type));
  const policyResource = useResource<{ policy: ApplicationPolicy; admin: boolean }>("/api/application-policy");
  const requestTypes: RecordType[] = policyResource.data ? availableTypes(policyResource.data.policy, policyResource.data.admin) : [];
  const unitResource = useResource<{ units: { id: string; name: string; role: UnitRole; canApply: boolean }[] }>("/api/units");
  const unitId = workspace.active?.id ?? "";
  const eligibleUnits = unitResource.data?.units.filter((unit) => unit.canApply) ?? [];
  const selectedUnit = eligibleUnits.find((unit) => unit.id === unitId);
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
  // With a single matching domain there is nothing to choose; fill blank rows without marking the form dirty.
  useEffect(() => {
    const loaded = data?.zones ?? [];
    setRecords((previous) => {
      const next = previous.map((record) => {
        const matching = loaded.filter((zone) => zoneAcceptsType(zone.name, record.type));
        return !record.zoneName && matching.length === 1 ? { ...record, zoneName: matching[0].name } : record;
      });
      return next.some((record, index) => record !== previous[index]) ? next : previous;
    });
  }, [data]);
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
  function changeType(record: DraftRecord, type: RecordType) {
    const matching = zonesFor(type);
    const zoneName = record.zoneName && zoneAcceptsType(record.zoneName, type) ? record.zoneName : matching.length === 1 ? matching[0].name : "";
    update(record.id, { type, zoneName, content: "" });
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
    const violation = policyViolation(policyResource.data.policy, records.map((r) => r.type), unitId || undefined, !!selectedUnit);
    if (violation) { setError(violation); return; }
    const unavailable = records.findIndex((record) => !zonesFor(record.type).some((zone) => zone.name === record.zoneName));
    if (unavailable !== -1) { setErrorRecordId(records[unavailable].id); setError("第 " + (unavailable + 1) + " 筆：請選擇目前可申請的網域。"); return; }
    const formData = new FormData(event.currentTarget);
    sending.current = true;
    setPending(true);
    try {
      const result = await apiRequest<{ applicationId: string; count: number }>("/api/dns-requests", jsonRequest("POST", {
        operation,
        applicantName: formData.get("applicantName"),
        applicantEmail: formData.get("applicantEmail"),
        applicantUnit: selectedUnit?.name || formData.get("applicantUnit"),
        ...(unitId ? { unitId } : {}),
        applicantExtension: formData.get("applicantExtension"),
        records: records.map((record) => ({ zoneName: record.zoneName, name: record.name, type: record.type, content: record.content, purpose: record.purpose, notes: record.notes, ttl: Number(record.ttl) })),
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

  if (unitResource.loading) return <LoadingPanel label="正在確認單位與申請權限…" />;
  if (unitResource.error) return <ResourceError message={unitResource.error} retry={unitResource.reload} />;
  if (!selectedUnit) return <EmptyState title={workspace.active ? "此單位目前無法申請" : "尚未加入單位"} description={workspace.active ? "須加入已啟用的單位才能申請。請聯絡單位管理員確認權限。" : "請提供學號給單位管理員或系統管理員，由管理員將你加入單位。"} action={<Link className="button" href="/dns">查看單位 DNS</Link>} />;

  return <>{policyResource.error && <ResourceError message="無法取得申請規則，暫時無法送出申請。" retry={policyResource.reload} />}<p className="sr-only" role="status">{policyResource.loading ? "載入申請規則…" : ""}</p><form className="card dns-application" onSubmit={submit} onChange={() => { dirty.current = true; }} aria-label={claiming ? "DNS 歸屬申請" : "申請 DNS"} aria-busy={pending}>
    <div className="modal-body">
      <fieldset className="application-section" disabled={pending}>
        <legend>申請人資料</legend>
        <p className="application-help">本次申請歸屬「{selectedUnit.name}」。</p>
        <div className="applicant-grid">
          <ContactPicker />
          <label>申請人姓名<input name="applicantName" autoComplete="name" required maxLength={100} placeholder="請填寫姓名" /></label>
          <label>申請單位<input value={selectedUnit?.name || "請先選擇單位"} readOnly /></label>
          <label>申請人電子郵件<input name="applicantEmail" type="email" required autoComplete="email" maxLength={320} placeholder="可聯絡的電子郵件" /></label>
          <label>單位分機<input name="applicantExtension" inputMode="numeric" autoComplete="tel-extension" required pattern="[0-9]{1,10}" maxLength={10} title="請填入 1–10 位數字" placeholder="例如 1234" /></label>
        </div>
      </fieldset>

      <section className="application-records" aria-labelledby="application-records-title">
        <div className="application-records-heading"><h2 id="application-records-title">DNS 紀錄<span>{records.length} 筆</span></h2><button className="button" type="button" disabled={loading || pending} onClick={() => void reload()}><RefreshCw size={14} className={loading ? "spin" : ""} />重新載入網域</button></div>

        {loading && <p className="application-help" role="status">正在取得可申請的網域…</p>}
        {zoneError && <div className="form-error" role="alert"><AlertTriangle size={17} /><div>無法取得網域清單，請按「重新載入網域」重試。<small className="zone-error-detail">{zoneError}</small></div></div>}
        {!loading && !zoneError && zones.length === 0 && <div className="request-notice" role="status">目前沒有可申請的網域，請聯絡管理員。</div>}

        {records.map((record, index) => <fieldset key={record.id} className={"application-record" + (errorRecordId === record.id ? " has-error" : "")} disabled={pending} aria-label={"第 " + (index + 1) + " 筆 DNS 紀錄"}>
          <div className="application-record-head"><h3>紀錄 {index + 1}</h3><button className="icon-button danger-hover" type="button" disabled={records.length === 1 || pending} aria-label={"移除第 " + (index + 1) + " 筆"} title="移除此筆，可復原" onClick={() => removeRecord(record.id)}><Trash2 size={16} /></button></div>
          <div className={"dns-fields" + (claiming ? " no-ttl" : "")}>
            <label className="type-field">類型<Select aria-label="DNS 類型" value={record.type} onChange={(value) => changeType(record, value as RecordType)} options={[...(!requestTypes.includes(record.type) ? [{ value: record.type, label: `${record.type}（未開放，請改選）`, disabled: true }] : []), ...requestTypes.map((type) => ({ value: type, label: type }))]} /></label>
            <label className="zone-field">{record.type === "PTR" ? "反解網域" : "網域"}<Select aria-label="網域" value={record.zoneName} required disabled={loading || Boolean(zoneError) || !zones.length} onChange={(value) => update(record.id, { zoneName: value })} options={[{ value: "", label: zonesFor(record.type).length ? "選擇網域" : record.type === "PTR" ? "沒有可申請的反解網域" : "沒有可申請的正解網域", disabled: true }, ...(record.zoneName && !zonesFor(record.type).some((zone) => zone.name === record.zoneName) ? [{ value: record.zoneName, label: `${record.zoneName}（目前無法使用）`, disabled: true }] : []), ...zonesFor(record.type).map((zone) => ({ value: zone.name, label: zone.name.replace(/\.$/, "") }))]} /></label>
            <label>名稱<input value={record.name} onChange={(event) => update(record.id, { name: event.target.value })} placeholder={record.type === "PTR" ? "IP 末段，例如 10" : "www 或 @"} required maxLength={253} autoCapitalize="none" spellCheck={false} aria-describedby={`fqdn-${record.id}`} ref={(node) => { if (node && focusId.current === record.id) { if (!record.zoneName) node.closest("fieldset")?.querySelector<HTMLElement>(".zone-field .custom-select-trigger")?.focus(); else node.focus(); focusId.current = null; } }} /><small id={`fqdn-${record.id}`} className="fqdn-preview">{fqdnPreview(record)}</small></label>
            <ContentField record={record} onChange={(content) => update(record.id, { content })} />
            {!claiming && <label>TTL<Select aria-label="TTL" value={record.ttl} onChange={(value) => update(record.id, { ttl: value })} options={[{ value: "60", label: "1 分鐘" }, { value: "300", label: "5 分鐘" }, { value: "600", label: "10 分鐘" }, { value: "1800", label: "30 分鐘" }, { value: "3600", label: "1 小時" }]} /></label>}
            <label className="purpose-field">用途<textarea rows={2} required value={record.purpose} onChange={(event) => update(record.id, { purpose: event.target.value })} placeholder="請說明此 DNS 的服務名稱與實際用途，供後續清查使用" maxLength={1000} /></label>
            <label className="purpose-field">備註（選填）<textarea rows={2} value={record.notes} onChange={(event) => update(record.id, { notes: event.target.value })} placeholder="其他需要補充的說明" maxLength={1000} /></label>
          </div>
          {errorRecordId === record.id && <p className="record-error" role="alert" tabIndex={-1} ref={errorTarget}>{error}。其餘資料已保留。</p>}
        </fieldset>)}
        <button ref={addButton} className="button add-record-button" type="button" onClick={addRecord} disabled={pending}><Plus size={18} />新增下一筆 DNS 紀錄</button>
        {removed && <div className="removal-notice" role="status"><span>已移除 {removed.record.name || "未命名紀錄"}</span><button type="button" disabled={pending} onClick={undoRemove}>復原</button></div>}
      </section>
      <p className="application-review-note">{claiming ? "核准後歸屬本單位，解析內容維持不變；已有單位歸屬的紀錄須由管理員處理。" : "核准前不會建立 DNS 紀錄。"}</p>
      {error && errorRecordId === null && <div className="form-error" role="alert"><AlertTriangle size={17} /><p ref={errorTarget} tabIndex={-1}>{error}。填寫內容已保留。</p></div>}
    </div>
    <div className="modal-foot"><span className="application-count" aria-live="polite">共 {records.length} 筆待送出</span><button className="button" type="button" data-leave-workspace disabled={pending} onClick={() => router.push("/requests")}>返回申請紀錄</button><button type="submit" className="button primary" disabled={pending || loading || Boolean(zoneError) || !zones.length || (!selectedUnit || unitResource.loading || Boolean(unitResource.error) || policyResource.loading || Boolean(policyResource.error))}>{pending && <Loader2 className="spin" size={16} />}{pending ? "送出中…" : "送出 " + records.length + " 筆申請"}</button></div>
  </form>{leaveTarget && <Dialog title="要離開尚未送出的申請嗎？" description="離開後，這次填寫的聯絡資料和 DNS 紀錄不會保留。" onClose={() => setLeaveTarget(null)}><div className="modal-foot"><button type="button" className="button" onClick={() => { dirty.current = false; setLeaveTarget(null); leaveTarget.click(); }}>離開並捨棄</button><button type="button" className="button primary" data-dialog-initial-focus onClick={() => setLeaveTarget(null)}>繼續填寫</button></div></Dialog>}</>;
}

function ContentField({ record, onChange }: { record: DraftRecord; onChange: (content: string) => void }) {
  const parts = contentParts[record.type];
  const help = <small id={`content-help-${record.id}`}>{contentHelp(record.type)}</small>;
  if (!parts) return <label className="content-field">解析內容<input value={record.content} onChange={(event) => onChange(event.target.value)} placeholder={hints[record.type]} required maxLength={65535} autoCapitalize="none" spellCheck={false} aria-label="解析內容" aria-describedby={`content-help-${record.id}`} />{help}</label>;
  // The last value keeps any spaces (e.g. a CAA value); earlier values are single tokens.
  const values = record.content.split(" ");
  const value = (index: number) => index < parts.length - 1 ? values[index] ?? "" : values.slice(index).join(" ");
  const set = (index: number, next: string) => onChange(parts.map((_, i) => i === index ? (i < parts.length - 1 ? next.replace(/\s/g, "") : next) : value(i)).join(" "));
  return <fieldset className={`content-field content-parts parts-${record.type}`} aria-describedby={`content-help-${record.id}`}>
    <legend>解析內容</legend>
    <div className="content-parts-grid">{parts.map((part, index) => <label key={part.label}>{part.label}{part.options
      ? <Select aria-label={part.label} required value={value(index)} onChange={(next) => set(index, next)} options={[{ value: "", label: "選擇", disabled: true }, ...part.options.map((option) => ({ value: option, label: option }))]} />
      : <input value={value(index)} onChange={(event) => set(index, event.target.value)} placeholder={part.placeholder} required inputMode={part.numeric ? "numeric" : undefined} pattern={part.numeric ? "[0-9]+" : undefined} maxLength={part.numeric ? 5 : 4096} autoCapitalize="none" spellCheck={false} />}</label>)}</div>
    {help}
  </fieldset>;
}

function fqdnPreview(record: DraftRecord) {
  // Mirrors normalizeDnsName: "@" is the apex, names already ending in the zone are kept as-is.
  const zone = record.zoneName.toLowerCase().replace(/\.+$/, "");
  const name = record.name.trim().toLowerCase().replace(/\.+$/, "");
  if (!zone) return "選擇網域後顯示完整名稱";
  if (!name) return `完整名稱：…${zone}`;
  if (name === "@" || name === zone) return `完整名稱：${zone}`;
  return `完整名稱：${name.endsWith(zone) ? name : `${name}.${zone}`}`;
}
