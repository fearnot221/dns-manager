export type AccountUnit = { id: string; name: string };
export function groupAccounts<T extends { globalRole: string; protected?: boolean; units?: AccountUnit[] }>(users: T[]) {
  const groups = new Map<string, { id: string; name: string; users: T[] }>();
  for (const user of users) {
    const units = user.protected || user.globalRole !== "USER" ? [{ id: "system-admins", name: "系統管理員" }] : user.units?.length ? user.units : [{ id: "unassigned", name: "未加入單位" }];
    for (const unit of units) {
      if (!groups.has(unit.id)) groups.set(unit.id, { ...unit, users: [] });
      groups.get(unit.id)!.users.push(user);
    }
  }
  return [...groups.values()].sort((a, b) => {
    const rank = (id: string) => id === "system-admins" ? 0 : id === "unassigned" ? 2 : 1;
    return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "zh-TW");
  });
}
