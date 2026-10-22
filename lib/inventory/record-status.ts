import { z } from "zod";

export const recordStatuses = ["IN_USE", "DEPRECATED", "RESERVED", "DISABLED"] as const;
export type RecordStatus = typeof recordStatuses[number];
export const recordStatusLabels: Record<RecordStatus, string> = { IN_USE: "使用中", DEPRECATED: "棄用", RESERVED: "保留", DISABLED: "停用" };
export const recordStatusSchema = z.enum(recordStatuses).nullable().optional();
export function recordStatusLabel(status?: string | null) {
  return recordStatusLabels[status as RecordStatus] ?? "未設定";
}
export const deprecatedRecordNotice = "設為「棄用」的紀錄，將由機房端於清查後刪除。";
