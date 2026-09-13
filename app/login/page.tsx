import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { redirect } from "next/navigation";
import { CredentialsSignIn } from "@/components/auth/credentials-sign-in";
import { demoLoginEnabled, passwordLoginEnabled } from "@/lib/auth/policy";
import { auth } from "@/lib/auth/config";
import { requireActor, AuthError } from "@/lib/auth/session";
import { portalConfigured } from "@/lib/auth/ncu-portal";
import { PortalSignIn } from "@/components/auth/portal-sign-in";

export const metadata = { title: "登入" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; reason?: string }> }) {
  const session = await auth();
  if (session?.user) {
    let active = false;
    try { await requireActor(); active = true; } catch (error) { if (!(error instanceof AuthError)) throw error; }
    if (active) redirect("/requests");
  }
  const { error, reason } = await searchParams;
  const demo = demoLoginEnabled();
  return <main className="login-page">
    <div className="login-card">
      <div className="login-identity"><div className="login-brand"><Brand /></div></div>
      <div className="login-form-panel">
      <div className="login-copy"><h1>登入工作區</h1><p>{demo ? "本機展示環境，請使用測試帳號。" : "使用中央大學 Portal 帳號安全登入。"}</p></div>
      {reason === "idle" && <p className="request-notice" role="status">已因閒置 15 分鐘自動登出，請重新登入。</p>}
      {error && <div className="form-error" role="alert">登入失敗，請確認帳密；使用 Portal 時須授權帳號與已驗證的 Email，不接受代理登入。若仍無法登入，請聯絡管理員。</div>}
      {!demo && portalConfigured() && <PortalSignIn />}
      {!demo && portalConfigured() && passwordLoginEnabled() && <div className="login-divider"><span>或使用帳號密碼</span></div>}
      {passwordLoginEnabled() && <CredentialsSignIn />}
      {!portalConfigured() && !passwordLoginEnabled() && <div className="form-error" role="alert">登入尚未完成設定，請聯絡系統管理員。</div>}
      <div className="login-foot"><ShieldCheck size={14} /> 僅限授權帳號使用</div>
      </div>
    </div>
  </main>;
}
