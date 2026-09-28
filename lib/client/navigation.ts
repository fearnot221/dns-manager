export type NavIcon = "apply" | "requests" | "dns" | "units" | "zones" | "inventory" | "users" | "settings" | "activity";
export type NavItem = { href: string; label: string; icon: NavIcon; nested?: boolean };
export type NavGroup = { id: string; label: string; items: NavItem[] };

// Presentation only. Server routes remain responsible for authorization.
export function workspaceNavigation(admin: boolean, systemAdmin: boolean, unitAdmin = false): NavGroup[] {
  const items: NavItem[] = [
    ...(!systemAdmin ? [{ href: "/dns", label: "單位 DNS", icon: "dns" as const }, { href: "/requests/new", label: "申請 DNS", icon: "apply" as const }] : []),
    { href: "/requests", label: admin ? "申請審核" : "申請紀錄", icon: "requests" },
  ];
  if (unitAdmin || systemAdmin) items.push({ href: "/units", label: "單位管理", icon: "units" });
  if (admin) items.push(
    { href: "/zones", label: "DNS 管理", icon: "zones", nested: true },
    { href: "/admin/application-policy", label: "申請規則", icon: "settings" },
  );
  if (systemAdmin) items.push(
    { href: "/admin/dns-changes", label: "DNS 變更紀錄", icon: "activity" },
    { href: "/admin/users", label: "帳號管理", icon: "users" },
    { href: "/activity", label: "操作紀錄", icon: "activity" },
  );
  return [{ id: "navigation", label: "功能導覽", items }];
}
export function isNavActive(pathname: string, item: NavItem) {
  return pathname === item.href || !!item.nested && pathname.startsWith(`${item.href}/`);
}
