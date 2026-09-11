"use client";

import { ClipboardCheck, Users, Cable, FileCheck2, FilePlus2, Globe2, LogOut, Menu, Monitor, Moon, Sun, X } from "lucide-react";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

export function AppShell({ children, identity, admin, systemAdmin, demo }: {
  children: React.ReactNode;
  identity: { name: string; email: string };
  admin: boolean;
  systemAdmin: boolean;
  demo: boolean;
}) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobile, setMobile] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const zones = pathname.startsWith("/zones");
  const applying = pathname === "/requests/new";
  const sectionLabel = pathname === "/inventory" ? "DNS 定期清查" : pathname === "/admin/users" ? "使用者管理" : pathname === "/admin/powerdns" ? "PowerDNS API" : zones ? "Zone 管理" : admin ? "DNS 申請審核" : applying ? "申請 DNS" : "我的 DNS";
  const zone = zones && pathname.split("/")[2] ? decodeURIComponent(pathname.split("/")[2]) : null;

  useEffect(() => {
    if (!mobile) return;
    const navigation = sidebar.current!;
    const trigger = menu.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    navigation.querySelector<HTMLButtonElement>(".mobile-close")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
      if (event.key !== "Tab") return;
      const controls = [...navigation.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const closeOnDesktop = () => { if (window.innerWidth > 900) setMobile(false); };
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", closeOnDesktop);
      if (trigger?.getClientRects().length) trigger.focus();
    };
  }, [mobile]);

  return <div className="shell">
    <a href="#workspace-content" className="skip-link">跳至主要內容</a>
    {mobile && <button type="button" className="navigation-backdrop" tabIndex={-1} aria-label="關閉導覽選單" onClick={() => setMobile(false)} />}
    <aside ref={sidebar} id="workspace-navigation" className={`sidebar ${mobile ? "mobile-open" : ""}`}>
      <div className="brand"><Brand /><button className="icon-button mobile-close" onClick={() => setMobile(false)} aria-label="關閉導覽選單"><X size={20} /></button></div>
      <p className="nav-label">{admin ? "管理員工作區" : "個人工作區"}</p>
      <nav className="nav" aria-label="工作區導覽">
        {!admin && <Link className={applying ? "active" : ""} aria-current={applying ? "page" : undefined} href="/requests/new" onClick={() => setMobile(false)}><FilePlus2 size={18} /><span>申請 DNS</span></Link>}
        <Link className={pathname === "/requests" ? "active" : ""} aria-current={pathname === "/requests" ? "page" : undefined} href="/requests" onClick={() => setMobile(false)}><FileCheck2 size={18} /><span>{admin ? "DNS 申請審核" : "我的 DNS"}</span></Link>
        {admin && <Link className={zones ? "active" : ""} aria-current={zones ? "page" : undefined} href="/zones" onClick={() => setMobile(false)}><Globe2 size={18} /><span>Zone 管理</span></Link>}
        {admin && <Link href="/inventory" className={pathname === "/inventory" ? "active" : ""} aria-current={pathname === "/inventory" ? "page" : undefined} onClick={() => setMobile(false)}><ClipboardCheck size={18} /><span>DNS 定期清查</span></Link>}
        {systemAdmin && <><Link href="/admin/users" className={pathname === "/admin/users" ? "active" : ""} aria-current={pathname === "/admin/users" ? "page" : undefined} onClick={() => setMobile(false)}><Users size={18} /><span>使用者管理</span></Link><Link href="/admin/powerdns" className={pathname === "/admin/powerdns" ? "active" : ""} aria-current={pathname === "/admin/powerdns" ? "page" : undefined} onClick={() => setMobile(false)}><Cable size={18} /><span>PowerDNS API</span></Link></>}
      </nav>
      <div className="sidebar-bottom">
        {demo && <div className="demo-label"><Monitor size={15} /><span>Local demo</span></div>}
        <div className="account-panel">
          <div className="avatar">{identity.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div><strong title={identity.name}>{identity.name}</strong><span title={identity.email}>{identity.email}</span><small>{admin ? "管理員" : "使用者"}</small></div>
          <button className="icon-button" data-leave-workspace onClick={() => signOut({ callbackUrl: "/login" })} aria-label="登出" title="登出"><LogOut size={17} /></button>
        </div>
      </div>
    </aside>
    <div className="main" inert={mobile || undefined}>
      <header className="topbar">
        <div className="crumb"><button ref={menu} className="icon-button menu" onClick={() => setMobile(true)} aria-expanded={mobile} aria-controls="workspace-navigation" aria-label="開啟導覽選單"><Menu size={20} /></button>
          {zone ? <><Link href="/zones">{sectionLabel}</Link><span aria-hidden="true">/</span><strong>{zone}</strong></> : <strong>{sectionLabel}</strong>}
        </div>
        <button className="icon-button theme-toggle" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="切換明暗模式" title="切換明暗模式"><Sun size={18} className="theme-sun" /><Moon size={18} className="theme-moon" /></button>
      </header>
      <main id="workspace-content" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
