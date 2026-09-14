"use client";

import { AlertTriangle, Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

export function CredentialsSignIn() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const passwordId = useId();
  const submitting = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
        redirect: false,
        callbackUrl: "/requests",
      });
      if (!result || result.error) {
        setError("帳號或密碼不正確，請再試一次。");
        return;
      }
      router.replace("/requests");
      router.refresh();
    } catch {
      setError("目前無法登入，請稍後重試。");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return <form className="credentials-form" onSubmit={submit} aria-busy={pending}>
    <label>電子郵件<div className="login-input"><Mail size={15} /><input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" required autoFocus readOnly={pending} /></div></label>
    <div className="login-field"><label htmlFor={passwordId}>密碼</label><div className="login-input"><LockKeyhole size={15} aria-hidden="true" /><input id={passwordId} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="輸入你的密碼" required readOnly={pending} /><button type="button" className="password-visibility" aria-label={showPassword ? "隱藏密碼" : "顯示密碼"} aria-controls={passwordId} disabled={pending} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button></div></div>
    {error && <div className="login-error" role="alert" tabIndex={-1} ref={errorRef}><AlertTriangle size={14} aria-hidden="true" />{error}</div>}
    <button className="credentials-button" disabled={pending}>{pending ? <Loader2 size={16} className="spin" /> : <LockKeyhole size={15} />}{pending ? "登入中…" : "登入工作區"}</button>
  </form>;
}
