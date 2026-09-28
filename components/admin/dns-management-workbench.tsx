"use client";

import { useId, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { compareInventoryDomains } from "@/lib/inventory/view";
import type { Zone } from "@/lib/dns/types";
import { EmptyState } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { InventoryWorkbench } from "./inventory-workbench";

type ManagedZone = Omit<Zone, "rrsets"> & { permission: string; recordCount: number };
export function DnsManagementWorkbench({ initialDomain = "", systemAdmin, canDeleteInspections }: { initialDomain?: string; systemAdmin: boolean; canDeleteInspections: boolean }) {
  const { data, loading, error, reload } = useResource<{ zones: ManagedZone[] }>("/api/zones");
  const [domain, setDomain] = useState(initialDomain);
  const tabsId = useId();
  const zones = useMemo(() => [...(data?.zones ?? [])].sort((a, b) => compareInventoryDomains(a.name, b.name)), [data]);
  const active = zones.find((zone) => zone.name.toLowerCase().replace(/\.$/, "") === domain.toLowerCase().replace(/\.$/, "")) ?? zones[0];
  if (error) return <ResourceError message={error} retry={reload} />;
  if (loading && !data) return <p role="status">正在載入網域…</p>;
  if (!active) return <EmptyState title="目前沒有可管理的網域" description="請確認網域授權或稍後重新整理。" action={<button className="button" onClick={() => void reload()}>重新整理</button>} />;
  return <>
    <div className="zone-category-tabs inventory-domain-tabs" role="tablist" aria-label="DNS 管理網域">{zones.map((zone, index) => <button key={zone.name} type="button" role="tab" id={`${tabsId}-tab-${index}`} aria-controls={`${tabsId}-panel`} aria-selected={active.name === zone.name} tabIndex={active.name === zone.name ? 0 : -1} onClick={() => setDomain(zone.name)} onKeyDown={(event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % zones.length;
      else if (event.key === "ArrowLeft") next = (index + zones.length - 1) % zones.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = zones.length - 1;
      else return;
      event.preventDefault(); setDomain(zones[next].name); document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}>{zone.name}</button>)}</div>
    <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${zones.indexOf(active)}`} tabIndex={0}>
      <div className="unit-heading"><p className="description">{active.kind} · 序號 {active.serial} · DNSSEC {active.dnssec ? "已啟用" : "未啟用"}</p><button className="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} aria-hidden="true" />更新網域清單</button></div>
      <InventoryWorkbench key={active.name} zoneName={active.name} systemAdmin={systemAdmin} canDeleteInspections={canDeleteInspections} onRecordsChanged={reload} />
    </section>
  </>;
}
