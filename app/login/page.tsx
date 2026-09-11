import { ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { redirect } from "next/navigation";
import { CredentialsSignIn } from "@/components/auth/credentials-sign-in";
import { SignInButton } from "@/components/auth/sign-in-button";
import { auth } from "@/lib/auth/config";
import { requireActor, AuthError } from "@/lib/auth/session";
import { portalConfigured } from "@/lib/auth/ncu-portal";
import { PortalSignIn } from "@/components/auth/portal-sign-in";

export const metadata = { title: "登入" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  if (session?.user) {
    let active = false;
    try { await requireActor(); active = true; } catch (error) { if (!(error instanceof AuthError)) throw error; }
    if (active) redirect("/requests");
  }
  const { error } = await searchParams;
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <main className="login-page">
    <div className="login-card">
      <div className="login-identity"><div className="login-brand"><Brand /></div></div>
      <div className="login-form-panel">
      <div className="login-copy"><h1>登入工作區</h1><p>使用你的帳號繼續。</p></div>
      {error && <div className="form-error" role="alert">登入失敗。Portal 登入須授權帳號與已驗證的 Email，不接受代理登入；既有帳號需先由維運人員確認綁定。</div>}
      {portalConfigured() && <><PortalSignIn /><div className="login-divider"><span>或使用本機帳號</span></div></>}
      <CredentialsSignIn />
      {googleEnabled && <><div className="login-divider"><span>or</span></div><SignInButton /></>}
      <div className="login-foot"><ShieldCheck size={14} /> 僅限授權帳號使用</div>
      </div>
    </div>
  </main>;
}
