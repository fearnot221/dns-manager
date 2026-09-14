export type UnitRole = "VIEWER" | "EDITOR" | "ADMIN";
export const unitRoleLabels: Record<UnitRole, string> = { VIEWER: "查看", EDITOR: "編輯（送出申請）", ADMIN: "單位管理" };
export function canSubmitUnitRequest(role: UnitRole | null | undefined) { return role === "EDITOR" || role === "ADMIN"; }
export function wouldRemoveLastAdmin(role: UnitRole, nextRole: UnitRole | null, adminCount: number) {
  return role === "ADMIN" && nextRole !== "ADMIN" && adminCount <= 1;
}
