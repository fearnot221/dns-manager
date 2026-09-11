"use client";
import type { PdnsRecord, RRSet } from "@/lib/dns/types";
import type { InventoryRecord } from "@/lib/inventory/types";
export function OwnershipSummary({ zone, rrset, record, open }: { zone: string; rrset: RRSet; record: PdnsRecord; open: (record: InventoryRecord) => void }) {
  const owner = record.ownership;
  if (!owner) return null;
  return <button type="button" className="ownership-summary" onClick={() => open({ zoneName: zone, recordName: rrset.name, recordType: rrset.type, content: record.content, ttl: rrset.ttl, disabled: record.disabled, ownership: owner })} aria-label={`管理 ${rrset.name} ${record.content} 的歸屬資料`}>
    <span>{owner.applicantName || "未填申請人"} · {owner.applicantUnit || "未填單位"}</span><small>{owner.purpose || "補登用途與聯絡資料"}</small>
  </button>;
}
