import type { RecordType } from "@/lib/dns/types";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type DnsRequest = {
  id: string;
  operation?: "CREATE" | "CLAIM" | "UPDATE" | "DELETE";
  applicationId?: string | null;
  unitId?: string | null;
  sourceRecordId?: string | null;
  originalContent?: string | null;
  applicantName?: string | null;
  applicantEmail?: string | null;
  recordPurpose?: string | null;
  applicantUnit?: string | null;
  applicantExtension?: string | null;
  zoneName: string;
  recordName: string;
  recordType: string;
  content: string;
  ttl: number;
  notes?: string | null;
  purpose?: string | null;
  status: RequestStatus;
  reviewNote?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  canReview: boolean;
  user: { id: string; name?: string | null; email: string | null; studentId?: string | null; accounts?: { providerAccountId: string }[] };
  reviewer?: { name?: string | null; email: string } | null;
};

export const requestTypes: RecordType[] = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA", "PTR"];
export type RequestScope = "ALL" | "MINE" | "SHARED" | "REVIEWABLE";
export function scopeRequests(requests: DnsRequest[], scope: RequestScope, actorId: string) {
  return requests.filter((item) => scope === "ALL" || (scope === "MINE" && item.user.id === actorId) || (scope === "SHARED" && !!item.unitId) || (scope === "REVIEWABLE" && item.canReview));
}
export const statuses: Array<{ key: "ALL" | RequestStatus; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "PENDING", label: "待審核" },
  { key: "APPROVED", label: "已核准" },
  { key: "REJECTED", label: "未核准" },
  { key: "CANCELLED", label: "已取消" },
];

export function filterRequests(requests: DnsRequest[], query: string, status: "ALL" | RequestStatus) {
  const needle = query.trim().toLowerCase();
  return requests.filter((item) => (status === "ALL" || item.status === status) && [
    item.zoneName, item.recordName, item.recordType, item.content,
    item.user.name, item.user.studentId,
    item.applicantName, item.applicantEmail, item.recordPurpose, item.applicantUnit, item.applicantExtension, item.purpose, item.reviewNote,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle));
}

export function displayRecordName(name: string, zone: string) {
  const cleanName = name.replace(/\.$/, "");
  const cleanZone = zone.replace(/\.$/, "");
  return cleanName === cleanZone ? "@" : cleanName.endsWith(`.${cleanZone}`) ? cleanName.slice(0, -cleanZone.length - 1) : cleanName;
}
export function contentHelp(type: RecordType) {
  if (type === "MX") return "優先序數字越小越優先；郵件伺服器填完整主機名稱。";
  if (type === "SRV") return "優先序、權重及連接埠為 0–65535 的數字；目標主機填完整主機名稱。";
  if (type === "CAA") return "旗標通常為 0；issue／issuewild 填憑證授權單位，iodef 填通報網址。";
  if (type === "PTR") return "填入此 IP 對應的完整主機名稱，例如 host.example.com。";
  if (type === "A") return "填入 IPv4 位址，例如 192.0.2.10。";
  if (type === "AAAA") return "填入 IPv6 位址，例如 2001:db8::1。";
  return type === "TXT" ? "需要時，系統會自動加上引號。" : "填入完整目標主機名稱，例如 target.example.com。";
}
