"use client";
import { toast } from "sonner";
import { RecordTable, RecordList, GroupedRecords } from "@/components/records/record-views";
import { RecordGrid } from "@/components/records/record-board";
import type { HashedRRSet, ViewMode } from "@/components/records/model";
import type { InventoryRecord } from "@/lib/inventory/types";
import type { RecordType } from "@/lib/dns/types";
export function InventoryViews({ records, view, open }: { records: InventoryRecord[]; view: ViewMode; open: (record: InventoryRecord) => void }) {
 const zones = [...new Set(records.map((r) => r.zoneName))];
 return <>{zones.map((zone) => {
   const rrsets: HashedRRSet[] = [];
   for (const record of records.filter((r) => r.zoneName === zone)) {
     let rrset = rrsets.find((r) => r.name === record.recordName && r.type === record.recordType);
     if (!rrset) { rrset = { name: record.recordName, type: record.recordType as RecordType, ttl: record.ttl, hash: record.ownership.id, records: [] }; rrsets.push(rrset); }
     rrset.records.push({ content: record.content, disabled: record.disabled, ownership: record.ownership });
   }
   const props = { zone, rrsets, canMutate: () => false, open: () => {}, openOwnership: open, copy: (value: string) => { void navigator.clipboard.writeText(value).then(() => toast.success("已複製")).catch(() => toast.error("無法複製，請手動選取")); } };
   return <div key={zone}><h3>{zone}</h3>{view === "table" ? <RecordTable {...props} /> : view === "list" ? <RecordList {...props} /> : view === "grid" ? <RecordGrid {...props} /> : <GroupedRecords {...props} mode={view} />}</div>;
 })}</>;
}
