"use client";
import { useResource } from "@/lib/client/use-resource";
type Contact = { id: string; name: string; email: string; units: string[] };
export function ContactPicker() {
  const { data, error } = useResource<{ contacts: Contact[] }>("/api/users/contacts");
  if (!data?.contacts?.length) return error ? <p className="description">資料帳號暫時無法載入，仍可手動填寫聯絡資料。</p> : null;
  return <label>從資料帳號填入<select aria-label="從資料帳號填入" defaultValue="" onChange={(event) => {
    const contact = data.contacts.find((item) => item.id === event.target.value);
    const form = event.target.form;
    if (!contact || !form) return;
    for (const [name, value] of [["applicantName", contact.name], ["applicantEmail", contact.email], ...(contact.units.length === 1 ? [["applicantUnit", contact.units[0]]] : [])]) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement && !field.readOnly && !field.disabled) field.value = value;
    }
  }}><option value="">選擇資料帳號（選填）</option>{data.contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}{contact.units.length ? ` · ${contact.units.join("、")}` : ""}{contact.email ? ` · ${contact.email}` : ""}</option>)}</select></label>;
}
