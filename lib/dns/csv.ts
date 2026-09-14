/** RFC-style CSV quoting plus spreadsheet formula-injection protection. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  // eslint-disable-next-line no-control-regex -- Detect control-prefixed spreadsheet formulas in untrusted DNS data.
  if (/^[\s\u0000-\u001f]*[=+@-]/u.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvRow(values: unknown[]) { return values.map(csvCell).join(",") + "\r\n"; }

export const dnsCsvHeaders = ["Zone", "Zone 類別", "Zone Serial", "DNSSEC", "名稱", "Type", "Content", "TTL", "已停用", "申請人", "申請人 Email", "申請單位", "單位分機", "用途", "資料更新時間", "清查歷史 JSON", "RRset 註解 JSON"];
