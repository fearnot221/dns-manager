"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
type Connection = { apiUrl: string; serverId: string; hasApiKey: boolean; updatedAt: string | null; updatedBy: string | null; demoMode: boolean };
export function PowerDNSSettings() {
  const { data, loading, error, reload } = useResource<Connection>("/api/admin/powerdns");
  if (error) return <ResourceError message={error} retry={reload} />;
  if (loading || !data) return <p role="status">正在載入連線設定…</p>;
  return <ConnectionForm key={data.updatedAt || "initial"} connection={data} reload={reload} />;
}
function ConnectionForm({ connection, reload }: { connection: Connection; reload: () => Promise<void> }) {
  const form = useRef<HTMLFormElement>(null); const sending = useRef(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function save(test: boolean) {
    if (sending.current || !form.current?.reportValidity()) return; const values = new FormData(form.current); sending.current = true; setPending(true); setError(""); setMessage("");
    try { const result = await apiRequest<{ message: string }>("/api/admin/powerdns", jsonRequest(test ? "POST" : "PUT", { apiUrl: values.get("apiUrl"), serverId: values.get("serverId"), apiKey: values.get("apiKey") })); setMessage(result.message); if (!test) { toast.success(result.message); form.current?.reset(); await reload(); } }
    catch (error) { setError(error instanceof Error ? error.message : "連線操作失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  return <form ref={form} className="card settings-form" onSubmit={(e) => { e.preventDefault(); void save(false); }}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">{connection.demoMode && <div className="request-notice">Local demo：設定會保存在本機，但 DNS 操作仍使用示範資料。只有按「測試連線」才會查詢你填寫的 API，不會修改 DNS。</div>}<label>PowerDNS API 網址<input name="apiUrl" type="url" defaultValue={connection.apiUrl} placeholder="http://127.0.0.1:8081/api/v1" required /><small>須以 /api/v1 結尾，主機需列入伺服器 PDNS_ALLOWED_ORIGINS。</small></label><label>Server ID<input name="serverId" defaultValue={connection.serverId} pattern="[a-zA-Z0-9_-]{1,100}" required /><small>PowerDNS Authoritative 預設為 localhost。</small></label><label>API 金鑰<input name="apiKey" type="password" autoComplete="new-password" maxLength={4096} placeholder={connection.hasApiKey ? "已有金鑰；留白保留原值" : "輸入 X-API-Key"} /><small>加密保存，不回傳原文。更換 API 網址或 Server ID 時必須重新輸入。</small></label><p className="description">{connection.updatedAt ? `最近儲存：${new Date(connection.updatedAt).toLocaleString("zh-TW")} · ${connection.updatedBy}` : "目前使用伺服器環境設定。"}</p>{error && <div className="form-error" role="alert">{error}</div>}{message && <div className="request-notice" role="status">{message}</div>}</div><div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={() => void save(true)}>測試連線（唯讀）</button><button className="button primary" disabled={pending}>{pending ? "處理中…" : "儲存連線設定"}</button></div></fieldset></form>;
}
