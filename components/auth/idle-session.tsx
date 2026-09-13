"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

export function IdleSession() {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    let expiresAt = 0, dirty = false, pending = false, stopped = false, leaving = false, lastSent = 0;
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("dns-manager-idle");
    async function leave() {
      if (leaving || stopped) return;
      leaving = true;
      try { await signOut({ redirect: false }); } catch { /* Server idle enforcement remains authoritative offline. */ }
      finally { window.location.replace("/login?reason=idle"); }
    }
    async function sync(touch: boolean) {
      if (pending || stopped || leaving) return;
      pending = true;
      if (touch) { dirty = false; lastSent = Date.now(); }
      try {
        const response = await fetch("/api/session/activity", { method: touch ? "POST" : "GET", cache: "no-store" });
        if (response.status === 401) { await leave(); return; }
        if (!response.ok) { if (expiresAt && Date.now() >= expiresAt) await leave(); return; }
        const data = await response.json();
        if (typeof data.expiresAt !== "number") { await leave(); return; }
        expiresAt = data.expiresAt;
        if (touch) channel?.postMessage({ activity: true });
      } catch { if (expiresAt && Date.now() >= expiresAt) await leave(); }
      finally { pending = false; }
    }
    function activity(event: Event) {
      if (!event.isTrusted || document.visibilityState !== "visible") return;
      if (expiresAt && Date.now() >= expiresAt) { void sync(false); return; }
      dirty = true;
      if (Date.now() - lastSent >= 10_000) void sync(true);
    }
    function visible() { if (document.visibilityState === "visible") void sync(false); }
    if (channel) channel.onmessage = () => { void sync(false); }; // Verify other tabs against the server.
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, activity, { passive: true }));
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => {
      const now = Date.now();
      if (!expiresAt) { void sync(false); return; }
      const seconds = Math.ceil((expiresAt - now) / 1000);
      setRemaining(seconds <= 60 ? Math.max(0, seconds) : null);
      if (seconds <= 0) { void sync(false); return; } // Catch sleep and another tab extending the session.
      if (dirty && now - lastSent >= 10_000) void sync(true);
    }, 1000);
    void sync(false);
    return () => { stopped = true; clearInterval(timer); channel?.close(); events.forEach((event) => window.removeEventListener(event, activity)); document.removeEventListener("visibilitychange", visible); };
  }, []);
  return remaining === null ? null : <div className="idle-warning" role="status">閒置登入即將逾時（{remaining} 秒）。請操作畫面以繼續使用；未儲存的內容將不會自動送出。</div>;
}
