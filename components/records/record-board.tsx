"use client";

import { Grid3X3, Pencil } from "lucide-react";
import { RECORD_TYPES, type PdnsRecord } from "@/lib/dns/types";
import { OwnershipSummary } from "./ownership-summary";
import { TypeBadge } from "./record-views";
import { ScrollRegion } from "@/components/ui/scroll-region";
import { boardColumns, displayName, ipSuffix, type HashedRRSet, type RecordViewProps } from "./model";

type BoardEntry = { rrset: HashedRRSet; record: PdnsRecord };

export function RecordGrid({ rrsets, zone, canMutate, copy, open, openOwnership }: RecordViewProps) {
  const rowTypes = RECORD_TYPES.filter((recordType) => rrsets.some((rrset) => rrset.type === recordType));
  return <div className="board-view">
    <div className="board-guide">
      <div className="board-title"><Grid3X3 size={17} /><div><strong>IP 棋盤</strong><span>依紀錄類型與 IP 尾碼查找；可水平捲動查看其他範圍。</span></div></div>
      <div className="board-legend">
        <span><b>欄</b> IPv4 最後一段／IPv6 最後一位元組（十進位）</span>
        <span><b>列</b> DNS 紀錄類型</span>
        <span><b>其他</b> 非 IP 內容</span>
      </div>
    </div>
    <ScrollRegion className="card board-scroll" label="DNS IP 棋盤，可用方向鍵水平捲動查看範圍">
      <table className="record-board">
        <thead><tr><th className="board-corner" scope="col">類型</th>{boardColumns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}</tr></thead>
        <tbody>{rowTypes.map((recordType) => {
          const rowEntries = rrsets.filter((rrset) => rrset.type === recordType).flatMap((rrset) => rrset.records.map((record) => ({ rrset, record })));
          const cells = new Map<string, BoardEntry[]>();
          for (const entry of rowEntries) {
            const suffix = ipSuffix(recordType, entry.record.content);
            const column = suffix === null ? boardColumns.at(-1)! : boardColumns.find((item) => item.min <= suffix && suffix <= item.max)!;
            cells.set(column.key, [...(cells.get(column.key) ?? []), entry]);
          }
          return <tr className={`board-type-${recordType.toLowerCase()}`} key={recordType}>
            <th scope="row" className="board-row-head"><TypeBadge type={recordType} /><span>{rowEntries.length}</span></th>
            {boardColumns.map((column) => {
              const entries = cells.get(column.key) ?? [];
              return <td className={entries.length ? "board-cell" : "board-cell is-empty"} key={column.key}>
                {entries.map(({ rrset, record }, index) => <div className="board-record" key={`${rrset.name}-${record.content}-${index}`}>
                  <button onClick={() => copy(record.content)} title={`複製 ${record.content}`}>
                    <strong>{displayName(rrset.name, zone)}</strong><code>{record.content}</code>{record.disabled && <span className="disabled-count">已停用</span>}
                  </button>
                  {canMutate(rrset) && <button className="board-edit" onClick={() => open({ mode: "edit", rrset })} aria-label={`編輯 ${displayName(rrset.name, zone)} ${rrset.type}`}><Pencil size={12} /></button>}
                  <div className="board-ownership"><OwnershipSummary zone={zone} rrset={rrset} record={record} open={openOwnership} /></div>
                </div>)}
              </td>;
            })}
          </tr>;
        })}</tbody>
      </table>
    </ScrollRegion>
  </div>;
}
