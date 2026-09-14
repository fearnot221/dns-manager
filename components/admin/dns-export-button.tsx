"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function DnsExportButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const sending = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  async function download() {
    if (sending.current) return;
    sending.current = true; setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/dns-export", { method: "POST", cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(response.status === 401 ? "登入已逾時，請重新登入後匯出。" : body?.error || "匯出失敗，請稍後重試。");
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) throw new Error("伺服器未回傳 CSV，請重新登入後重試。");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = response.headers.get("content-disposition")?.match(/filename="(dns-records-[\w.-]+\.csv)"/)?.[1] || "dns-records.csv";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast.success("CSV 已產生並開始下載");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "匯出失敗，請重試。"); }
    finally { sending.current = false; setPending(false); }
  }
  return <div><button type="button" className="button" disabled={pending} aria-busy={pending} onClick={download} title="匯出所有一般與反解網域，包含停用紀錄及歸屬、清查資料，不受目前篩選影響">{pending ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}{pending ? "正在匯出全部 DNS…" : "匯出全部 DNS CSV"}</button>{error && <p className="form-error" ref={errorRef} tabIndex={-1} role="alert">{error}</p>}</div>;
}
