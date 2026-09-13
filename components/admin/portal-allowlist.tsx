"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { Dialog } from "@/components/ui/dialog";
import type { AllowlistEntry } from "@/lib/auth/allowlist";

export function PortalAllowlist() {
  const { data, loading, error, reload } = useResource<{ entries: AllowlistEntry[] }>("/api/admin/allowlist");
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState("");
  const sending = useRef(false);
  async function change(value: string, remove: boolean) {
    if (sending.current) return;
    sending.current = true; setPending(true); setFailure("");
    try {
      const result = await apiRequest<{ message: string }>("/api/admin/allowlist", jsonRequest(remove ? "DELETE" : "POST", { email: value.trim() }));
      toast.success(result.message); setRemoving(null); if (!remove) setEmail(""); await reload();
    } catch (error) { setFailure(error instanceof Error ? error.message : "無法更新白名單。"); }
    finally { sending.current = false; setPending(false); }
  }
  const entries = (data?.entries ?? []).filter((entry) => entry.email.includes(query.trim().toLowerCase()));
  return <>
    <form className="admin-toolbar" onSubmit={(event) => { event.preventDefault(); void change(email, false); }}>
      <label className="filter-input">允許登入的 Email<input type="email" required maxLength={254} autoComplete="off" placeholder="name@ce.ncu.edu.tw" value={email} onChange={(event) => setEmail(event.target.value)} disabled={pending} /></label>
      <button className="button primary" disabled={pending || loading || !!error}>{pending ? "儲存中…" : "加入白名單"}</button>
    </form>
    <p className="muted">請填 Portal 已驗證的完整 Email，不支援網域或萬用字元。此清單僅限制 Portal，帳密登入由帳號狀態獨立控制。</p>
    {failure && !removing && <p className="form-error" role="alert">{failure}</p>}
    <div className="admin-toolbar"><div className="filter-input"><input aria-label="搜尋白名單 Email" placeholder="搜尋 Email" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status">正在載入白名單…</p> : <div className="card table-card"><ScrollRegion className="table-wrap" label="Portal 登入白名單"><table><thead><tr><th>Email</th><th>新增人</th><th>新增日期</th><th>操作</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.email}><td>{entry.email}</td><td>{entry.protected ? "系統" : entry.addedBy}</td><td>{entry.addedAt ? new Date(entry.addedAt).toLocaleDateString("zh-TW") : "—"}</td><td>{entry.protected ? <span className="muted">內建項目</span> : <button className="button" disabled={pending} onClick={() => { setFailure(""); setRemoving(entry.email); }}>移除</button>}</td></tr>)}</tbody></table></ScrollRegion>{!entries.length && <p className="empty">沒有符合條件的 Email。</p>}</div>}
    {removing && <Dialog title="移除登入權限" description={`${removing} 將無法繼續使用 Portal 登入，現有 Portal session 也會失效。帳密登入不受影響。`} pending={pending} onClose={() => setRemoving(null)}><div className="modal-body">{failure && <p className="form-error" role="alert">{failure}</p>}</div><div className="modal-foot"><button className="button" disabled={pending} onClick={() => setRemoving(null)}>取消</button><button className="button primary" disabled={pending} onClick={() => void change(removing, true)}>{pending ? "移除中…" : "確認移除"}</button></div></Dialog>}
  </>;
}
