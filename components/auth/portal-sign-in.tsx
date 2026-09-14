"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { signIn } from "next-auth/react";
export function PortalSignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const submitting = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function login() {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(false);
    try {
      await signIn("ncu-portal", { redirectTo: "/requests" });
    } catch {
      submitting.current = false;
      setPending(false);
      setError(true);
    }
  }

  return <div className="portal-sign-in">
    <button type="button" className="button primary" disabled={pending} aria-busy={pending} onClick={login}>
      {pending && <Loader2 size={16} className="spin" aria-hidden="true" />}
      {pending ? "正在前往 NCU Portal…" : "使用 NCU Portal 登入"}
    </button>
    {error && <p className="login-error" role="alert" tabIndex={-1} ref={errorRef}><AlertTriangle size={14} aria-hidden="true" />無法開始登入，請檢查網路連線後重試。若問題持續，請聯絡管理員。</p>}
  </div>;
}
