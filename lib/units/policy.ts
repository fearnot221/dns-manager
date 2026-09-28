export type UnitRole = "EDITOR" | "ADMIN";
export const unitRoleLabels: Record<UnitRole, string> = { EDITOR: "成員", ADMIN: "管理員" };
export function canSubmitUnitRequest(role: UnitRole | null | undefined) { return role === "EDITOR" || role === "ADMIN"; }
export function wouldRemoveLastAdmin(role: UnitRole, nextRole: UnitRole | null, adminCount: number) {
  return role === "ADMIN" && nextRole !== "ADMIN" && adminCount <= 1;
}
