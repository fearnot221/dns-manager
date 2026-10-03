"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { compareInventoryDomains } from "@/lib/inventory/view";
import type { Zone } from "@/lib/dns/types";
import { EmptyState, LoadingPanel } from "@/components/ui";
import { ResourceError } from "@/components/ui/resource-error";
import { InventoryWorkbench } from "./inventory-workbench";

type ManagedZone = Omit<Zone, "rrsets"> & { permission: string; recordCount: number };
export function DnsManagementWorkbench({ initialDomain = "", systemAdmin, canDeleteInspections }: { initialDomain?: string; systemAdmin: boolean; canDeleteInspections: boolean }) {
  const { data, loading, error, reload } = useResource<{ zones: ManagedZone[] }>("/api/zones");
  const [domain, setDomain] = useState(initialDomain);
  const tabsId = useId();
  // Keep the selected domain in the address bar so reloads and shared links reopen it.
  useEffect(() => {
    const sync = () => setDomain(new URLSearchParams(window.location.search).get("domain") ?? "");
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  function selectDomain(name: string) {
    setDomain(name);
    const url = new URL(window.location.href);
    url.searchParams.set("domain", name.replace(/\.$/, ""));
    window.history.replaceState(null, "", url);
  }
  const zones = useMemo(() => [...(data?.zones ?? [])].sort((a, b) => compareInventoryDomains(a.name, b.name)), [data]);
  const active = zones.find((zone) => zone.name.toLowerCase().replace(/\.$/, "") === domain.toLowerCase().replace(/\.$/, "")) ?? zones[0];
  if (error) return <ResourceError message={error} retry={reload} />;
  if (loading && !data) return <LoadingPanel label="正在載入網域…" />;
  if (!active) return <EmptyState title="目前沒有可管理的網域" description="請確認網域授權或稍後重新整理。" action={<button className="button" onClick={() => void reload()}>重新整理</button>} />;
  return <>
    <div className="zone-category-tabs inventory-domain-tabs" role="tablist" aria-label="DNS 管理網域">{zones.map((zone, index) => <button key={zone.name} type="button" role="tab" id={`${tabsId}-tab-${index}`} aria-controls={`${tabsId}-panel`} aria-selected={active.name === zone.name} tabIndex={active.name === zone.name ? 0 : -1} onClick={() => selectDomain(zone.name)} onKeyDown={(event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % zones.length;
      else if (event.key === "ArrowLeft") next = (index + zones.length - 1) % zones.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = zones.length - 1;
      else return;
      event.preventDefault(); selectDomain(zones[next].name); document.getElementById(`${tabsId}-tab-${next}`)?.focus();
    }}>{zone.name}</button>)}</div>
    <section id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-tab-${zones.indexOf(active)}`} tabIndex={0}>
      <div className="unit-heading zone-heading"><div><h2>{active.name.replace(/\.$/, "")}</h2><p className="zone-meta"><span>{active.kind}</span><span>序號 <span className="mono">{active.serial}</span></span><span>DNSSEC {active.dnssec ? "已啟用" : "未啟用"}</span></p></div><button className="button" disabled={loading} onClick={() => void reload()}><RefreshCw size={15} aria-hidden="true" />更新網域清單</button></div>
      <InventoryWorkbench key={active.name} zoneName={active.name} systemAdmin={systemAdmin} canDeleteInspections={canDeleteInspections} onRecordsChanged={reload} />
    </section>
  </>;
}
