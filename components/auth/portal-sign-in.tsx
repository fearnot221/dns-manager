"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
export function PortalSignIn({ available = true, unavailableReason = "登入服務尚未完成設定，請聯絡系統管理員。" }: { available?: boolean; unavailableReason?: string }) {
  const helpId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function login() {
    if (!available || submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(false);
    try {
      await signIn("logto", { redirectTo: "/requests" });
    } catch {
      submitting.current = false;
      setPending(false);
      setError(true);
    }
  }

  return <div className="portal-sign-in">
    <button type="button" className="button primary" disabled={!available || pending} aria-busy={pending} aria-describedby={!available ? helpId : undefined} onClick={login}>
      {pending && <Loader2 size={16} className="spin" aria-hidden="true" />}
      {pending ? "正在前往 NCU Portal…" : "連接至 NCU Portal"}
    </button>
    {!available && <p id={helpId} className="field-help">{unavailableReason}</p>}
    {error && <p className="login-error" role="alert" tabIndex={-1} ref={errorRef}><AlertTriangle size={14} aria-hidden="true" />無法開始登入，請檢查網路連線後重試。若問題持續，請聯絡管理員。</p>}
  </div>;
}
