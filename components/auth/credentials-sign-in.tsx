"use client";

import { AlertTriangle, Loader2, LockKeyhole, Mail } from "lucide-react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CredentialsSignIn() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await signIn("credentials", {
        email: String(data.get("email")),
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
      setPending(false);
    }
  }

  return <form className="credentials-form" onSubmit={submit} aria-busy={pending}>
    <label>電子郵件<div className="login-input"><Mail size={15} /><input name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@example.com" required autoFocus readOnly={pending} /></div></label>
    <label>密碼<div className="login-input"><LockKeyhole size={15} /><input name="password" type="password" autoComplete="current-password" placeholder="輸入你的密碼" required readOnly={pending} /></div></label>
    {error && <div className="login-error" role="alert"><AlertTriangle size={14} />{error}</div>}
    <button className="credentials-button" disabled={pending}>{pending ? <Loader2 size={16} className="spin" /> : <LockKeyhole size={15} />}{pending ? "登入中…" : "登入工作區"}</button>
  </form>;
}
