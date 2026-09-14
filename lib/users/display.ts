export function personDisplay(person: { name?: string | null; email?: string | null; studentId?: string | null }) {
  const email = person.email?.trim();
  const auxiliary = (email && !email.toLowerCase().endsWith("@accounts.invalid") ? email : person.studentId?.trim()) || "";
  const primary = person.name?.trim() || auxiliary || "未提供姓名";
  return { primary, secondary: auxiliary === primary ? "" : auxiliary };
}
