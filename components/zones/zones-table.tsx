"use client";

import { ChevronRight, Globe2, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge, EmptyState, LoadingRows, SubmitButton } from "@/components/ui";
import type { Zone } from "@/lib/dns/types";

import { useResource } from "@/lib/client/use-resource";
import { ResourceError } from "@/components/ui/resource-error";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { Dialog } from "@/components/ui/dialog";
import { ScrollRegion } from "@/components/ui/scroll-region";

type ZoneRow = Omit<Zone, "rrsets"> & { recordCount: number; permission: string };

const emptyZones: ZoneRow[] = [];

export function ZonesTable({ canCreate = false }: { canCreate?: boolean }) {
  const { data, loading, error, reload: load } = useResource<{ zones: ZoneRow[] }>("/api/zones");
  const zones = data?.zones ?? emptyZones;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [pending, setPending] = useState(false);
  const sending = useRef(false);


  const rows = useMemo(
    () => zones.filter((zone) => zone.name.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [zones, query],
  );

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true;
    setCreateError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/zones", jsonRequest("POST", {
          name: form.get("name"),
          kind: form.get("kind"),
          nameservers: String(form.get("nameservers")).split(",").map((value) => value.trim()),
      }));
      toast.success("已建立 DNS 網域");
      setOpen(false);
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "無法建立網域，請稍後重試。");
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <>
    <div className="card table-card">
      <div className="table-tools">
        <div className="filter-input">
          <Search size={15} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋網域名稱" aria-label="搜尋網域" />
        </div>
        <div className="tool-spacer" />
        {canCreate && <button className="button" onClick={() => { setCreateError(""); setOpen(true); }}><Plus size={15} /> 新增網域</button>}
      </div>
      {error ? <ResourceError message={error} retry={load} /> : <ScrollRegion className="table-wrap" label="DNS 網域，可用方向鍵水平捲動">
        <table>
          <thead><tr><th scope="col">網域名稱</th><th scope="col">模式</th><th scope="col">序號</th><th scope="col">DNSSEC</th><th scope="col">紀錄數</th><th scope="col">權限</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
          <tbody>
            {loading ? <LoadingRows columns={7} /> : rows.map((zone) => {
              const path = zone.name.replace(/\.$/, "");
              return <tr key={zone.id}>
                <td><Link className="zone-link" href={`/zones/${encodeURIComponent(path)}`}><span className="zone-icon"><Globe2 size={15} /></span><div><strong>{path}</strong><small>權威 DNS 網域</small></div></Link></td>
                <td>{zone.kind}</td>
                <td className="mono">{zone.serial}</td>
                <td><Badge tone={zone.dnssec ? "green" : "neutral"}>{zone.dnssec ? "已啟用" : "未啟用"}</Badge></td>
                <td>{zone.recordCount}</td>
                <td><Badge tone="blue">{({ SUPER_ADMIN: "系統管理員", ADMIN: "網域管理員", EDITOR: "編輯者", VIEWER: "唯讀" } as Record<string, string>)[zone.permission] || "—"}</Badge></td>
                <td><Link className="icon-button" href={`/zones/${encodeURIComponent(path)}`} aria-label={`開啟 ${zone.name}`}><ChevronRight size={16} /></Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </ScrollRegion>}
      {!loading && !error && rows.length === 0 && <EmptyState title={query ? "沒有符合條件的網域" : "目前沒有可管理的網域"} description={query ? "請改用其他網域名稱，或清除搜尋。" : "目前帳號尚未分配可管理的網域。"} />}
    </div>

    {open && <Dialog title="新增 DNS 網域" description="在 PowerDNS 建立權威 DNS 網域。" pending={pending} onClose={() => setOpen(false)}>
      <form onSubmit={create}><fieldset className="dialog-fields" disabled={pending}>
        <div className="modal-body">
          {createError && <div className="form-error" role="alert">{createError}</div>}
          <label>網域名稱<input name="name" required autoFocus placeholder="example.com" /></label>
          <label>模式<select name="kind" defaultValue="Native"><option>Native</option><option>Master</option><option>Slave</option></select></label>
          <label>名稱伺服器<input name="nameservers" required placeholder="ns1.example.com, ns2.example.com" /><small>請填入實際的完整主機名稱，多筆以逗號分隔。</small></label>
        </div>
        <div className="modal-foot"><button type="button" className="button" disabled={pending} onClick={() => setOpen(false)}>取消</button><SubmitButton pending={pending} label="建立網域" /></div>
      </fieldset></form>
    </Dialog>}
  </>;
}
