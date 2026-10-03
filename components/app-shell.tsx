"use client";

import { UnitWorkspaceProvider, useUnitWorkspace, type UnitWorkspace } from "@/components/units/unit-workspace";
import { Building2, ClipboardCheck, FileCheck2, FilePlus2, Globe2, History, LogOut, Menu, Monitor, Moon, Network, PanelLeftClose, PanelLeftOpen, ShieldCheck, SlidersHorizontal, Sun, UserCog, X, ChevronDown } from "lucide-react";
import { Brand } from "@/components/brand";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { logoutAction } from "@/lib/auth/logout-action";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { workspaceNavigation, isNavActive, type NavIcon } from "@/lib/client/navigation";
import { IdleSession } from "@/components/auth/idle-session";

const navIcons: Record<NavIcon, typeof Globe2> = { dns: Network, apply: FilePlus2, requests: FileCheck2, units: Building2, zones: Globe2, inventory: ClipboardCheck, users: UserCog, settings: SlidersHorizontal, protection: ShieldCheck, activity: History };
const navigationStorageKey = "dns-manager-navigation-collapsed";

type ShellProps = {
  children: React.ReactNode;
  identity: { name: string; email: string };
  admin: boolean;
  systemAdmin: boolean;
  demo: boolean;
  units: UnitWorkspace[];
};
export function AppShell(props: ShellProps) {
  return <UnitWorkspaceProvider units={props.units}><ShellContent {...props} /></UnitWorkspaceProvider>;
}
function ShellContent({ children, identity, admin, systemAdmin, demo }: ShellProps) {
  const workspace = useUnitWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobile, setMobile] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(true);
  const sidebar = useRef<HTMLElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const switcher = useRef<HTMLDetailsElement>(null);
  const zones = pathname.startsWith("/zones");
  const groups = workspaceNavigation(admin, systemAdmin, workspace.active?.role === "ADMIN");
  const sectionLabel = groups.flatMap((group) => group.items).find((item) => isNavActive(pathname, item))?.label || "DNS 管理";
  const zone = zones && pathname.split("/")[2] ? decodeURIComponent(pathname.split("/")[2]) : null;

  useEffect(() => {
    try { if (localStorage.getItem(navigationStorageKey) === "1") setDesktopOpen(false); } catch { /* Preference is optional. */ }
  }, []);
  function toggleDesktopNavigation() {
    const next = !desktopOpen;
    setDesktopOpen(next);
    try { localStorage.setItem(navigationStorageKey, next ? "0" : "1"); } catch { /* Keep the preference in memory. */ }
  }

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
      const controls = [...navigation.querySelectorAll<HTMLElement>("a[href], summary, button:not([disabled])")].filter((element) => element.getClientRects().length);
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

  return <div className={`shell ${desktopOpen ? "" : "navigation-collapsed"}`}>
    <a href="#workspace-content" className="skip-link">跳至主要內容</a>
    {mobile && <button type="button" className="navigation-backdrop" tabIndex={-1} aria-label="關閉導覽選單" onClick={() => setMobile(false)} />}
    <aside ref={sidebar} id="workspace-navigation" className={`sidebar ${mobile ? "mobile-open" : ""}`}>
      <div className="brand"><Brand /><button className="icon-button mobile-close" onClick={() => setMobile(false)} aria-label="關閉導覽選單"><X size={20} /></button></div>
      {!systemAdmin && workspace.units.length > 1 ? <details ref={switcher} className="workspace-switcher">
        <summary><span><small>切換工作區</small><strong>{workspace.active?.name}</strong></span><ChevronDown size={16} aria-hidden="true" /></summary>
        <div>{workspace.units.map((unit) => <button type="button" key={unit.id} data-leave-workspace aria-pressed={unit.id === workspace.active?.id} onClick={() => { workspace.select(unit.id); if (switcher.current) switcher.current.open = false; router.push("/dns"); setMobile(false); }}><span>{unit.name}</span>{unit.id === workspace.active?.id && <span aria-hidden="true">✓</span>}</button>)}</div>
      </details> : !systemAdmin && workspace.active ? <p className="sidebar-unit" title={workspace.active.name}>{workspace.active.name}</p> : <p className={`sidebar-unit ${systemAdmin ? "is-system" : ""}`}>{systemAdmin ? "全部單位與網域" : "尚未加入單位"}</p>}
      <p className="nav-label" aria-hidden="true">功能選單</p>
      <nav className="nav" aria-label="功能導覽">
        {groups.flatMap((group) => group.items).map((item) => {
          const active = isNavActive(pathname, item);
          const Icon = navIcons[item.icon];
          return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => setMobile(false)}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        {demo && <div className="demo-label"><Monitor size={15} /><span>Local demo</span></div>}
        <div className="account-panel">
          <div className="avatar">{identity.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
          <div><strong title={identity.name}>{identity.name}</strong><span title={identity.email}>{identity.email}</span><small>{systemAdmin ? "系統管理員" : admin ? "網域管理員" : workspace.active?.role === "ADMIN" ? "單位管理員" : "單位成員"}</small></div>
          <form action={logoutAction}><button type="submit" className="icon-button" data-leave-workspace aria-label="登出" title="登出"><LogOut size={17} /></button></form>
        </div>
      </div>
    </aside>
    <div className="main" inert={mobile || undefined}>
      <header className="topbar">
        <div className="crumb"><button ref={menu} className="icon-button menu" onClick={() => setMobile(true)} aria-expanded={mobile} aria-controls="workspace-navigation" aria-label="開啟導覽選單"><Menu size={20} /></button>
          <button className="icon-button desktop-navigation-toggle" onClick={toggleDesktopNavigation} aria-expanded={desktopOpen} aria-controls="workspace-navigation" aria-label={desktopOpen ? "收合側邊導覽" : "展開側邊導覽"} title={desktopOpen ? "收合側邊導覽" : "展開側邊導覽"}>{desktopOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}</button>
          <span className="crumb-system">DNS 管理系統</span><span className="crumb-separator" aria-hidden="true">/</span>
          {zone ? <><Link href="/zones">{sectionLabel}</Link><span className="crumb-separator" aria-hidden="true">/</span><strong>{zone}</strong></> : <strong>{sectionLabel}</strong>}
        </div>
        <div className="topbar-tools"><button className="icon-button theme-toggle" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")} aria-label="切換明暗模式" title="切換明暗模式"><Sun size={18} className="theme-sun" /><Moon size={18} className="theme-moon" /></button></div>
      </header>
      <main id="workspace-content" tabIndex={-1}>{children}</main>
      <IdleSession />
    </div>
  </div>;
}
