"use client";
import { useId } from "react";
import { Select } from "@/components/ui/select";
import type { FormDrafts } from "@/lib/client/form-draft";
import { deprecatedRecordNotice, recordStatuses, recordStatusLabels } from "@/lib/inventory/record-status";

export function InspectionStatusField({ status, drafts, draftKey }: { status?: string | null; drafts?: FormDrafts; draftKey: string }) {
  const helpId = useId();
  return <label>狀態<Select name="recordStatus" aria-label="狀態" aria-describedby={helpId} defaultValue={drafts?.get(draftKey)?.recordStatus ?? status ?? ""} onChange={(value) => { if (drafts) drafts.set(draftKey, { ...drafts.get(draftKey), recordStatus: value }); }} options={[{ value: "", label: "未設定" }, ...recordStatuses.map((value) => ({ value, label: recordStatusLabels[value] }))]} /><small id={helpId}>{deprecatedRecordNotice}</small></label>;
}
