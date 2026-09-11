"use client";

import { Clipboard, Pencil, Trash2 } from "lucide-react";
import { OwnershipSummary } from "./ownership-summary";
import { Badge } from "@/components/ui";
import { ScrollRegion } from "@/components/ui/scroll-region";
import type { PdnsRecord, RecordType } from "@/lib/dns/types";
import { displayName, type HashedRRSet, type RecordViewProps, type ViewMode } from "./model";

export function RecordTable({ rrsets, zone, canMutate, copy, open, openOwnership }: RecordViewProps) {
  return <div className="card table-card"><ScrollRegion className="table-wrap records-table" label="DNS 紀錄，可用方向鍵水平捲動"><table>
    <thead><tr><th scope="col">類型</th><th scope="col">名稱</th><th scope="col">解析內容</th><th scope="col">TTL（秒）</th><th scope="col">狀態</th><th scope="col"><span className="sr-only">操作</span></th></tr></thead>
    <tbody>{rrsets.flatMap((rrset) => rrset.records.map((record, index) => (
      <tr key={`${rrset.name}-${rrset.type}-${record.content}-${index}`} className={index ? "rrset-child" : ""}>
        <td>{!index && <TypeBadge type={rrset.type} />}</td>
        <td>{!index && <CopyValue value={displayName(rrset.name, zone)} copyValue={rrset.name} copy={copy} note={rrset.records.length > 1 ? `${rrset.records.length} 個解析值` : undefined} />}</td>
        <td><CopyValue value={record.content} copy={copy} mono /><OwnershipSummary zone={zone} rrset={rrset} record={record} open={openOwnership} /></td>
        <td>{!index && rrset.ttl}</td>
        <td><Badge tone={record.disabled ? "neutral" : "green"}>{record.disabled ? "已停用" : "啟用中"}</Badge></td>
        <td>{canMutate(rrset) && <Actions rrset={rrset} record={record} first={!index} open={open} />}</td>
      </tr>
    )))}</tbody>
  </table></ScrollRegion></div>;
}

export function RecordList({ rrsets, zone, canMutate, copy, open, openOwnership }: RecordViewProps) {
  return <div className="record-list">{rrsets.map((rrset) => (
    <article className="card record-row" key={`${rrset.name}-${rrset.type}`}>
      <TypeBadge type={rrset.type} />
      <div className="record-name">
        <CopyValue value={displayName(rrset.name, zone)} copyValue={rrset.name} copy={copy} />
        <span>TTL {rrset.ttl} 秒 · {rrset.records.length} 個解析值</span>
      </div>
      <div className="record-values">{rrset.records.map((record, index) => <div className="record-value-line" key={`${record.content}-${index}`}><div><CopyValue value={record.content} copy={copy} mono /><OwnershipSummary zone={zone} rrset={rrset} record={record} open={openOwnership} /></div>{record.disabled && <Badge>已停用</Badge>}</div>)}</div>
      {canMutate(rrset) && <Actions rrset={rrset} first open={open} />}
    </article>
  ))}</div>;
}

type GroupItem = { rrset: HashedRRSet; record?: PdnsRecord };

export function GroupedRecords({ mode, rrsets, zone, canMutate, copy, open, openOwnership }: RecordViewProps & { mode: Exclude<ViewMode, "table" | "list" | "grid"> }) {
  const groups = new Map<string, GroupItem[]>();
  for (const rrset of rrsets) {
    const items = mode === "content"
      ? rrset.records.map((record) => ({ key: record.content, item: { rrset, record } }))
      : [{ key: mode === "type" ? rrset.type : displayName(rrset.name, zone), item: { rrset } }];
    for (const { key, item } of items) groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return <div className="record-groups">{[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => (
    <section className="card record-group" key={key}>
      <header><div>
        {mode === "type" ? <TypeBadge type={key as RecordType} /> : <button className={`group-key ${mode === "content" ? "mono" : ""}`} onClick={() => copy(key)}><span>{key}</span><Clipboard size={12} /></button>}
        <span>{items.length} {mode === "content" ? "筆紀錄" : "組紀錄"}</span>
      </div></header>
      <div>{items.map(({ rrset, record }, index) => (
        <div className="group-record" key={`${key}-${rrset.name}-${rrset.type}-${index}`}>
          <TypeBadge type={rrset.type} />
          <div><strong>{displayName(rrset.name, zone)}</strong><span>{record ? `${rrset.ttl}s TTL` : rrset.records.map((item) => item.content + (item.disabled ? "（已停用）" : "")).join(" · ")}</span>{(record ? [record] : rrset.records).map((value, i) => <OwnershipSummary key={i} zone={zone} rrset={rrset} record={value} open={openOwnership} />)}</div>
          <small>{record ? (record.disabled ? "已停用" : "啟用中") : `${rrset.ttl} 秒`}{!record && rrset.records.some((value) => value.disabled) && <span className="disabled-count">{rrset.records.filter((value) => value.disabled).length} 筆已停用</span>}</small>
          {canMutate(rrset) && <Actions rrset={rrset} record={record} first={!record} open={open} />}
        </div>
      ))}</div>
    </section>
  ))}</div>;
}

function CopyValue({ value, copyValue, copy, mono, note }: { value: string; copyValue?: string; copy: (value: string) => void; mono?: boolean; note?: string }) {
  return <button className={`copy-value ${mono ? "mono" : ""}`} onClick={() => copy(copyValue ?? value)} title="複製"><span>{value}</span><Clipboard size={12} />{note && <small>{note}</small>}</button>;
}
export function TypeBadge({ type }: { type: RecordType }) {
  return <Badge tone={type === "A" ? "orange" : type === "AAAA" ? "blue" : "neutral"}>{type}</Badge>;
}
function Actions({ rrset, record, first, open }: { rrset: HashedRRSet; record?: PdnsRecord; first?: boolean; open: RecordViewProps["open"] }) {
  return <div className="row-actions">
    {first && <button className="icon-button" onClick={() => open({ mode: "edit", rrset })} aria-label={`編輯 ${rrset.name} ${rrset.type} 紀錄組`}><Pencil size={14} /></button>}
    {record && <button className="icon-button danger-hover" onClick={() => open({ mode: "delete", rrset: { ...rrset, records: [record] } })} aria-label={`刪除 ${rrset.name} 的解析值 ${record.content}`}><Trash2 size={14} /></button>}
  </div>;
}
