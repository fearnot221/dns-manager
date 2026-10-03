import { z } from "zod";

export const eventFields = z.object({
  name: z.string().trim().min(1, "請填寫活動名稱。").max(120, "活動名稱最多 120 字。"),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
}).strict().refine((value) => value.startsOn <= value.endsOn, { message: "結束日期不可早於開始日期。", path: ["endsOn"] });
export const eventUpdate = z.object({
  id: z.string().min(1).max(100),
  expectedRevision: z.number().int().positive(),
  event: eventFields,
}).strict();
export const eventDelete = eventUpdate.omit({ event: true });
export type EventFields = z.infer<typeof eventFields>;
export type InspectionEventView = EventFields & { id: string; revision: number };

export type InspectionEventSnapshot = { eventId?: string | null; eventName?: string | null; eventClassified?: boolean };
export function inspectionEventLabel(inspection: InspectionEventSnapshot) {
  return !inspection.eventClassified ? "舊紀錄（未標記活動）" : inspection.eventName ? `活動期間清查：${inspection.eventName}` : "非活動期間清查";
}

export function taipeiDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function eventStatus(event: EventFields, today: string) {
  return today < event.startsOn ? "尚未開始" : today > event.endsOn ? "已結束" : "進行中";
}
