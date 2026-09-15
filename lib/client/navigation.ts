export type NavIcon = "apply" | "requests" | "units" | "zones" | "inventory" | "contact" | "inspections" | "users" | "settings" | "activity";
export type NavItem = { href: string; label: string; icon: NavIcon; nested?: boolean };
export type NavGroup = { id: string; label: string; items: NavItem[] };

// Presentation only. Server routes remain responsible for authorization.
export function workspaceNavigation(admin: boolean, systemAdmin: boolean): NavGroup[] {
  const groups: NavGroup[] = [{ id: "dns", label: "DNS 工作區", items: [
    { href: "/requests/new", label: "申請 DNS", icon: "apply" },
    { href: "/requests", label: admin ? "DNS 申請審核" : "我的 DNS", icon: "requests" },
    { href: "/units", label: "單位與共享 DNS", icon: "units" },
  ] }, { id: "collaboration", label: "通知與協作", items: [
    { href: "/inspections", label: systemAdmin ? "清查回覆管理" : "我的清查通知", icon: "inspections" },
    { href: "/contact", label: systemAdmin ? "使用者訊息" : "聯絡管理員", icon: "contact" },
  ] }];
  if (admin) groups.push({ id: "records", label: "紀錄管理", items: [
    { href: "/zones", label: "Zone 管理", icon: "zones", nested: true },
    { href: "/admin/application-policy", label: "申請設定", icon: "settings" },
    { href: "/inventory", label: "DNS 定期清查", icon: "inventory" },
  ] });
  if (systemAdmin) groups.push({ id: "system", label: "系統管理", items: [
    { href: "/admin/users", label: "使用者管理", icon: "users" },
    { href: "/activity", label: "操作紀錄", icon: "activity" },
  ] });
  return groups;
}
export function isNavActive(pathname: string, item: NavItem) {
  return pathname === item.href || !!item.nested && pathname.startsWith(`${item.href}/`);
}
