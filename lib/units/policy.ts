export type UnitRole = "EDITOR" | "ADMIN";
export const unitRoleLabels: Record<UnitRole, string> = { EDITOR: "成員", ADMIN: "管理員" };
export function canSubmitUnitRequest(role: UnitRole | null | undefined) { return role === "EDITOR" || role === "ADMIN"; }
export function wouldRemoveLastAdmin(role: UnitRole, nextRole: UnitRole | null, adminCount: number) {
  return role === "ADMIN" && nextRole !== "ADMIN" && adminCount <= 1;
}
const unitDepartmentGroups = { 通訊系: ["資通組", "電通組", "系辦"], 電機系: ["電子組", "電波組", "固態組", "系生組", "系辦"] };
// Stored as "系／組"; existing units stay null until an admin assigns one.
export const unitDepartments = Object.entries(unitDepartmentGroups).flatMap(([department, groups]) => groups.map((group) => `${department}／${group}`)) as [string, ...string[]];
