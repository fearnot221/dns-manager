"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
export function PortalSignIn() {
  const [pending, setPending] = useState(false); const [error, setError] = useState(false);
  return <><button className="button primary" style={{ width: "100%" }} disabled={pending} onClick={async () => { setPending(true); setError(false); try { await signIn("ncu-portal", { redirectTo: "/requests" }); } catch { setPending(false); setError(true); } }}>{pending ? "正在前往 NCU Portal…" : "使用 NCU Portal 登入"}</button>{error && <p role="alert">無法開始登入，請重試。</p>}</>;
}
