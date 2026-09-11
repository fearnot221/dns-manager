import { dnsApplicationSchema } from "@/lib/validation/api";
import { normalizeDnsName, normalizeRecordContent, normalizeZoneName, validateTtl } from "@/lib/dns/names";

export class ApplicationInputError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export type RequestRecordInput = {
  zoneName: string; recordName: string; recordType: string; content: string; ttl: number; purpose: string | null;
};

export function requestRecordKey(record: Pick<RequestRecordInput, "zoneName" | "recordName" | "recordType" | "content">) {
  return JSON.stringify([record.zoneName, record.recordName, record.recordType, record.content]);
}

/** Validate every record before any write; a batch has no record-count ceiling. */
export function prepareApplication(input: unknown, availableZones: readonly string[]) {
  const result = dnsApplicationSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = String(issue.path.at(-1) ?? "");
    const labels: Record<string, string> = { applicantName: "申請人姓名", applicantUnit: "申請單位", applicantExtension: "單位分機", zoneName: "Zone 網域", name: "名稱", type: "紀錄類型", content: "內容", ttl: "TTL", purpose: "用途" };
    const prefix = issue.path[0] === "records" && typeof issue.path[1] === "number" ? `第 ${issue.path[1] + 1} 筆：` : "";
    throw new ApplicationInputError(`${prefix}${labels[field] ?? "申請資料"}格式不正確或未填寫。${issue.code === "custom" ? issue.message : ""}`);
  }
  const { records, ...applicant } = result.data;
  const zones = new Set(availableZones.map(normalizeZoneName));
  const seen = new Set<string>();
  const normalized = records.map((record, index): RequestRecordInput => {
    try {
      const zoneName = normalizeZoneName(record.zoneName);
      if (!zones.has(zoneName)) throw new ApplicationInputError("此 Zone 已不存在或無法申請，請重新載入網域清單。");
      const entry = { zoneName, recordName: normalizeDnsName(record.name, zoneName), recordType: record.type, content: normalizeRecordContent(record.type, record.content), ttl: validateTtl(record.ttl), purpose: record.purpose || null };
      const key = requestRecordKey(entry);
      if (seen.has(key)) throw new ApplicationInputError("與本次申請中的其他紀錄重複，請移除重複項目。", 409);
      seen.add(key);
      return entry;
    } catch (error) {
      throw new ApplicationInputError(`第 ${index + 1} 筆：${error instanceof Error ? error.message : "DNS 紀錄格式不正確"}`, error instanceof ApplicationInputError ? error.status : 400);
    }
  });
  return { ...applicant, records: normalized };
}

export type PreparedApplication = ReturnType<typeof prepareApplication>;
