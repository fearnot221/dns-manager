"use client";

import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { ResourceError } from "@/components/ui/resource-error";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import type { AccountUnit } from "@/lib/users/grouping";
import { unitRoleLabels, type UnitRole } from "@/lib/units/policy";

export function UserUnitsDialog({ user, onClose, onSaved }: { user: { id: string; name: string; disabled: boolean; units?: AccountUnit[] }; onClose: () => void; onSaved: () => Promise<void> }) {
  const resource = useResource<{ units: (AccountUnit & { status: string })[] }>("/api/units");
  const [memberships, setMemberships] = useState(user.units ?? []);
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState<UnitRole | "REMOVE">("EDITOR");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const errorId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  const current = memberships.find(unit => unit.id === unitId);
  const units = resource.data?.units.filter(unit => unit.status === "APPROVED") ?? [];
  return <Dialog title={`管理 ${user.name} 的所屬單位`} description="一次調整一個單位，其他所屬單位維持原設定。移出單位會撤銷該單位的使用資格。" onClose={onClose} pending={pending}>
    <form onSubmit={async event => {
      event.preventDefault();
      if (sending.current) return;
      sending.current = true; setPending(true); setError("");
      try {
        await apiRequest(`/api/units/${encodeURIComponent(unitId)}`, jsonRequest("PATCH", { action: current ? "member" : "add-member", userId: user.id, role: role === "REMOVE" ? null : role }));
        const unit = units.find(unit => unit.id === unitId)!;
        setMemberships(previous => [...previous.filter(unit => unit.id !== unitId), ...(role === "REMOVE" ? [] : [{ id: unit.id, name: unit.name, role }])]);
        setUnitId(""); setRole("EDITOR");
        toast.success("已更新所屬單位。");
        await onSaved();
      } catch (caught) { setError(caught instanceof Error ? caught.message : "無法更新所屬單位，請重試。"); }
      finally { sending.current = false; setPending(false); }
    }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">
      {memberships.length ? <ul>{memberships.map(unit => <li key={unit.id}>{unit.name} · {unitRoleLabels[unit.role ?? "EDITOR"]}</li>)}</ul> : <p>尚未加入任何單位。</p>}
      {resource.error ? <ResourceError message={resource.error} retry={resource.reload} /> : resource.loading ? <p role="status">載入單位清單…</p> : !units.length ? <p role="status">目前沒有可管理的已啟用單位。</p> : <>
        <label>單位<Select aria-label="單位" value={unitId} required onChange={value => { setUnitId(value); setRole(memberships.find(unit => unit.id === value)?.role ?? "EDITOR"); }} options={[{ value: "", label: "請選擇單位", disabled: true }, ...units.map(unit => ({ value: unit.id, label: `${unit.name}${memberships.some(member => member.id === unit.id) ? "（已加入）" : ""}` }))]} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label>
        <label>單位角色<Select aria-label="單位角色" value={role} onChange={value => setRole(value as UnitRole | "REMOVE")} options={[{ value: "EDITOR", label: "成員" }, { value: "ADMIN", label: "管理員", disabled: user.disabled }, ...(current ? [{ value: "REMOVE", label: "移出此單位" }] : [])]} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} /></label>
        {user.disabled && <p className="field-help">停用或資料帳號只能加入為成員，不能指派為管理員。</p>}
      </>}
      {error && <p id={errorId} ref={errorRef} tabIndex={-1} className="form-error" role="alert">{error}</p>}
    </div><div className="modal-foot"><button className="button" type="button" onClick={onClose}>關閉</button><button className="button primary" type="submit" aria-busy={pending} disabled={pending || !unitId || resource.loading || !!resource.error}>{pending ? "儲存中…" : "儲存單位設定"}</button></div></fieldset></form>
  </Dialog>;
}
