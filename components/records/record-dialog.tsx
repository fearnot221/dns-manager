"use client";

import { AlertTriangle, ShieldAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { SubmitButton } from "@/components/ui";
import type { RecordType } from "@/lib/dns/types";
import { creatableTypes, protectedTypes, type DialogState } from "./model";

import { Dialog } from "@/components/ui/dialog";
import { apiRequest, jsonRequest } from "@/lib/client/api";

export function RecordDialog({ zone, dialog, onClose, onSaved }: { zone: string; dialog: DialogState; onClose: () => void; onSaved: () => Promise<void> }) {
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const rr = dialog.rrset;
  const [type, setType] = useState<RecordType>(rr?.type ?? "A");
  const [error, setError] = useState("");


  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending.current) return;
    sending.current = true; setPending(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      let method = "POST";
      let body: Record<string, unknown>;
      if (dialog.mode === "delete") {
        method = "DELETE";
        body = { name: rr!.name, type: rr!.type, content: rr!.records[0].content, expectedHash: rr!.hash };
      } else if (dialog.mode === "edit") {
        method = "PATCH";
        body = { name: rr!.name, type: rr!.type, ttl: Number(data.get("ttl")), contents: String(data.get("contents")).split("\n").map((value) => value.trim()).filter(Boolean), expectedHash: rr!.hash };
      } else {
        body = { name: data.get("name"), type, ttl: Number(data.get("ttl")), content: contentFor(type, data) };
      }
      await apiRequest(`/api/zones/${encodeURIComponent(zone)}/records`, jsonRequest(method, body));
      toast.success(dialog.mode === "add" ? "已新增紀錄" : dialog.mode === "edit" ? "已更新紀錄組" : "已刪除解析值");
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "無法更新紀錄，請稍後重試。");
    } finally { sending.current = false; setPending(false); }
  }

  const protectedRecord = rr && protectedTypes.has(rr.type);
  return <Dialog title={dialog.mode === "add" ? "新增 DNS 紀錄" : dialog.mode === "edit" ? `編輯 ${rr?.type} 紀錄組` : "刪除此解析值？"}
    description={dialog.mode === "delete" ? "刪除後會立即影響 DNS 解析，且無法復原。" : dialog.mode === "edit" ? "同名稱、同類型的解析內容請每行填一筆。" : "填寫名稱與解析內容，儲存後立即生效。"}
    pending={pending} onClose={onClose}>
      <form onSubmit={submit}><fieldset className="dialog-fields" disabled={pending}><div className="modal-body">
        {protectedRecord && <div className="warning"><ShieldAlert size={18} /><div><strong>受保護的紀錄</strong><p>修改此類紀錄需要管理員權限。</p></div></div>}
        {dialog.mode === "delete" ? <div className="delete-summary">
          <div><span>類型</span><b>{rr?.type}</b></div><div><span>名稱</span><b>{rr?.name}</b></div><div><span>解析內容</span><code>{rr?.records[0].content}</code></div>
        </div> : dialog.mode === "edit" ? <>
          <label>名稱<input value={rr?.name} disabled /></label>
          <label>解析內容 <small>每行一筆</small><textarea name="contents" defaultValue={rr?.records.map((record) => record.content).join("\n")} rows={Math.max(3, rr?.records.length ?? 3)} required autoFocus /></label>
          <label>TTL<input name="ttl" type="number" min="30" defaultValue={rr?.ttl ?? 300} required /></label>
        </> : <>
          <div className="field-grid"><label>類型<select value={type} onChange={(event) => setType(event.target.value as RecordType)}>{creatableTypes.map((item) => <option key={item}>{item}</option>)}</select></label><label>名稱<input name="name" placeholder="@ 或 www" required autoFocus /></label></div>
          <DynamicFields type={type} />
          <label>TTL<select name="ttl" defaultValue="300"><option value="60">1 分鐘</option><option value="300">5 分鐘</option><option value="600">10 分鐘</option><option value="1800">30 分鐘</option><option value="3600">1 小時</option></select></label>
        </>}
        {error && <div className="form-error" role="alert"><AlertTriangle size={15} />{error}</div>}
      </div><div className="modal-foot"><button className="button" type="button" disabled={pending} onClick={onClose}>取消</button><SubmitButton pending={pending} label={dialog.mode === "delete" ? "確認刪除" : dialog.mode === "edit" ? "儲存紀錄組" : "新增紀錄"} /></div></fieldset></form>
  </Dialog>;
}

function DynamicFields({ type }: { type: RecordType }) {
  if (type === "MX") return <div className="field-grid"><label>優先序<input name="priority" type="number" defaultValue="10" required /></label><label>郵件伺服器<input name="target" required /></label></div>;
  if (type === "SRV") return <div className="field-grid four"><label>優先序<input name="priority" type="number" defaultValue="10" required /></label><label>權重<input name="weight" type="number" defaultValue="5" required /></label><label>連接埠<input name="port" type="number" defaultValue="443" required /></label><label>目標主機<input name="target" required /></label></div>;
  if (type === "CAA") return <div className="field-grid four"><label>旗標<input name="flags" type="number" defaultValue="0" required /></label><label>標籤<select name="tag"><option>issue</option><option>issuewild</option><option>iodef</option></select></label><label className="span-2">值<input name="value" required /></label></div>;
  return <label>{type === "A" ? "IPv4 位址" : type === "AAAA" ? "IPv6 位址" : type === "TXT" ? "文字內容" : "目標主機名稱"}<input name="content" required /></label>;
}
function contentFor(type: RecordType, data: FormData) {
  if (type === "MX") return `${data.get("priority")} ${data.get("target")}`;
  if (type === "SRV") return `${data.get("priority")} ${data.get("weight")} ${data.get("port")} ${data.get("target")}`;
  if (type === "CAA") return `${data.get("flags")} ${data.get("tag")} ${data.get("value")}`;
  return String(data.get("content"));
}
