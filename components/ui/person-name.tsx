import { personDisplay } from "@/lib/users/display";
export function PersonName(props: { name?: string | null; email?: string | null; studentId?: string | null }) {
  const { primary, secondary } = personDisplay(props);
  return <span className="person-name"><strong>{primary}</strong>{secondary && <small>{secondary}</small>}</span>;
}
