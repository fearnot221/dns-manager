"use client";
import { useRef } from "react";
import { useResource } from "@/lib/client/use-resource";
import { Select } from "@/components/ui/select";
type Contact = { id: string; name: string; email: string; units: string[] };
export const contactLabel = (contact: Contact) => `${contact.name}${contact.units.length ? ` · ${contact.units.join("、")}` : ""}${contact.email ? ` · ${contact.email}` : ""}`;
export function ContactPicker() {
  const { data, error } = useResource<{ contacts: Contact[] }>("/api/users/contacts");
  const field = useRef<HTMLLabelElement>(null);
  if (!data?.contacts?.length) return error ? <p className="description">資料帳號暫時無法載入，仍可手動填寫聯絡資料。</p> : null;
  function fill(id: string) {
    const contact = data?.contacts.find((item) => item.id === id);
    const form = field.current?.closest("form");
    if (!contact || !form) return;
    for (const [name, value] of [["applicantName", contact.name], ["applicantEmail", contact.email], ...(contact.units.length === 1 ? [["applicantUnit", contact.units[0]]] : [])]) {
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement && !input.readOnly && !input.disabled) input.value = value;
    }
    form.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return <label ref={field}>從資料帳號填入<Select aria-label="從資料帳號填入" defaultValue="" onChange={fill} options={[{ value: "", label: "選擇資料帳號（選填）" }, ...data.contacts.map((contact) => ({ value: contact.id, label: contactLabel(contact) }))]} /></label>;
}
