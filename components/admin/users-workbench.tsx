"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { Badge, SubmitButton } from "@/components/ui";
import { Dialog } from "@/components/ui/dialog";
import { ResourceError } from "@/components/ui/resource-error";
import { ScrollRegion } from "@/components/ui/scroll-region";
type UserRow = { id: string; name: string | null; email: string; globalRole: "USER" | "ADMIN" | "SUPER_ADMIN"; disabled: boolean; protected: boolean; zoneAdmin: boolean };
export function UsersWorkbench() {
  const { data, loading, error, reload } = useResource<{ users: UserRow[]; canAssignAdmin: boolean }>("/api/users");
  const [query, setQuery] = useState(""); const [editing, setEditing] = useState<UserRow | "new" | null>(null);
  const canEdit = (user: UserRow) => !user.protected && (data?.canAssignAdmin || (user.globalRole === "USER" && !user.zoneAdmin));
  const rows = (data?.users || []).filter((u) => `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()));
  return <><div className="admin-toolbar"><div className="filter-input"><input placeholder="搜尋姓名或電子郵件" aria-label="搜尋使用者" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button className="button primary" disabled={loading || !!error} onClick={() => setEditing("new")}>新增使用者</button></div>
    {error ? <ResourceError message={error} retry={reload} /> : loading ? <p role="status" className="record-results">正在載入使用者…</p> : <div className="card table-card"><ScrollRegion className="table-wrap" label="使用者清單，可水平捲動"><table><thead><tr><th>姓名／帳號</th><th>角色</th><th>狀態</th><th>操作</th></tr></thead><tbody>{rows.map((user) => <tr key={user.id}><td><strong>{user.name || "未填姓名"}</strong><div className="muted">{user.email}</div></td><td>{user.protected ? "最高使用者" : user.globalRole === "ADMIN" || user.zoneAdmin ? "管理員" : "一般使用者"}</td><td><Badge tone={user.disabled ? "neutral" : "green"}>{user.disabled ? "已停用" : "使用中"}</Badge></td><td>{user.protected ? <Badge>受保護</Badge> : <button className="button" disabled={!canEdit(user)} title={!canEdit(user) ? "只有最高使用者可修改管理員" : "管理使用者"} onClick={() => setEditing(user)}>管理</button>}</td></tr>)}</tbody></table></ScrollRegion>{!rows.length && <p className="empty">沒有符合條件的使用者。</p>}</div>}
    {editing && <UserDialog user={editing} canAssignAdmin={!!data?.canAssignAdmin} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reload(); }} />}
  </>;
}
function UserDialog({ user, canAssignAdmin, onClose, onSaved }: { user: UserRow | "new"; canAssignAdmin: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const creating = user === "new"; const [pending, setPending] = useState(false); const [error, setError] = useState(""); const sending = useRef(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (sending.current) return; sending.current = true; setPending(true); setError(""); const data = new FormData(event.currentTarget);
    const body = { name: data.get("name"), ...(creating ? { email: data.get("email"), password: data.get("password"), globalRole: canAssignAdmin ? data.get("globalRole") : "USER" } : { disabled: data.get("disabled") === "true", ...(canAssignAdmin ? { globalRole: data.get("globalRole") } : {}) }) };
    try { await apiRequest(creating ? "/api/users" : `/api/users/${user.id}`, jsonRequest(creating ? "POST" : "PATCH", body)); toast.success(creating ? "已新增使用者。" : "已更新使用者；停用帳號將無法繼續操作。"); await onSaved(); }
    catch (error) { setError(error instanceof Error ? error.message : "無法儲存使用者。"); }
    finally { sending.current = false; setPending(false); }
  }
  return <Dialog title={creating ? "新增使用者" : "管理使用者"} description="以停用代替刪除，保留申請與清查歷史。" onClose={onClose} pending={pending}><form onSubmit={submit}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body"><label>姓名<input name="name" defaultValue={creating ? "" : user.name || ""} required maxLength={100} /></label><label>電子郵件<input name="email" type="email" defaultValue={creating ? "" : user.email} required readOnly={!creating} /></label>{creating && <label>初始密碼<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /><small>至少 12 個字元，請以安全方式交付本人。</small></label>}{canAssignAdmin && <label>角色<select name="globalRole" defaultValue={creating ? "USER" : user.globalRole}><option value="USER">一般使用者</option><option value="ADMIN">管理員</option></select></label>}{!creating && <label>帳號狀態<select name="disabled" defaultValue={String(user.disabled)}><option value="false">使用中</option><option value="true">停用</option></select></label>}{error && <div className="form-error" role="alert">{error}</div>}</div><div className="modal-foot"><button className="button" type="button" onClick={onClose} disabled={pending}>取消</button><SubmitButton pending={pending} label={creating ? "新增使用者" : "儲存變更"} /></div></fieldset></form></Dialog>;
}
