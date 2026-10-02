"use client";
import { ContactPicker } from "@/components/units/contact-picker";

type ContactRecord = { applicantName?: string; applicantEmail?: string; applicantUnit?: string; applicantExtension?: string; purpose: string };
export function UnitRecordFields({ record, purposeName = "purpose" }: { record: ContactRecord; purposeName?: string }) {
  return <>
    <ContactPicker />
    <div className="field-grid">
      <label>申請人姓名<input name="applicantName" defaultValue={record.applicantName || ""} maxLength={100} autoComplete="name" /></label>
      <label>申請人電子郵件<input name="applicantEmail" type="email" defaultValue={record.applicantEmail || ""} maxLength={320} autoComplete="email" /></label>
      <label>申請單位<input value={record.applicantUnit || ""} readOnly /></label>
      <label>單位分機<input name="applicantExtension" defaultValue={record.applicantExtension || ""} maxLength={30} autoComplete="tel-extension" /></label>
    </div>
    <label>DNS 用途<textarea name={purposeName} defaultValue={record.purpose} maxLength={1000} rows={3} placeholder="服務名稱與實際用途" /></label>
  </>;
}
