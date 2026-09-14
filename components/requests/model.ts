import type { RecordType } from "@/lib/dns/types";

export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type DnsRequest = {
  id: string;
  applicationId?: string | null;
  unitId?: string | null;
  sourceRecordId?: string | null;
  originalContent?: string | null;
  applicantName?: string | null;
  applicantUnit?: string | null;
  applicantExtension?: string | null;
  zoneName: string;
  recordName: string;
  recordType: string;
  content: string;
  ttl: number;
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
    item.user.email, item.user.name,
    item.applicantName, item.applicantUnit, item.applicantExtension, item.purpose, item.reviewNote,
  ].filter(Boolean).join(" ").toLowerCase().includes(needle));
}

export function displayRecordName(name: string, zone: string) {
  const cleanName = name.replace(/\.$/, "");
  const cleanZone = zone.replace(/\.$/, "");
  return cleanName === cleanZone ? "@" : cleanName.endsWith(`.${cleanZone}`) ? cleanName.slice(0, -cleanZone.length - 1) : cleanName;
}
export function contentHelp(type: RecordType) {
  if (type === "MX") return "依序填入優先序及郵件伺服器，例如 10 mail.example.com。";
  if (type === "SRV") return "依序填入優先序、權重、連接埠及目標主機。";
  if (type === "CAA") return "依序填入旗標、標籤及憑證授權單位。";
  if (type === "A") return "填入 IPv4 位址，例如 192.0.2.10。";
  if (type === "AAAA") return "填入 IPv6 位址，例如 2001:db8::1。";
  return type === "TXT" ? "需要時，系統會自動加上引號。" : "填入完整目標主機名稱，例如 target.example.com。";
}
