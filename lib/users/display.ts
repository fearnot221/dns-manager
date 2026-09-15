export function personDisplay(person: { name?: string | null; email?: string | null; studentId?: string | null }) {
  const email = person.email?.trim();
  const auxiliary = [...new Set([person.studentId?.trim(), email && !email.toLowerCase().endsWith("@accounts.invalid") ? email : ""].filter(Boolean))];
  const primary = person.name?.trim() || auxiliary[0] || "未提供姓名";
  return { primary, secondary: auxiliary.filter((value) => value !== primary).join(" · ") };
}
